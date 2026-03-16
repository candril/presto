/**
 * GraphQL API provider for bulk PR fetching
 * Uses direct fetch to GitHub's GraphQL API for maximum speed
 */

import { $ } from "bun"
import type { PR } from "../types"

/** Cached GitHub token */
let cachedToken: string | null = null

/**
 * Get GitHub auth token (cached after first call)
 */
async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken
  cachedToken = (await $`gh auth token`.text()).trim()
  return cachedToken
}

/**
 * Pre-warm the token cache at startup
 */
export async function initGraphQL(): Promise<void> {
  await getToken()
}

/**
 * Fragment for PR fields we need
 */
const PR_FRAGMENT = `
  number
  title
  url
  state
  isDraft
  createdAt
  updatedAt
  author { login }
  reviewDecision
  comments { totalCount }
  reviews { totalCount }
  headRefOid
  commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup { state }
      }
    }
  }
`

/**
 * Transform GraphQL PR response to our PR type
 */
function transformGraphQLPR(raw: any): PR {
  const statusRollup = raw.commits?.nodes?.[0]?.commit?.statusCheckRollup

  // Map GraphQL rollup state to a synthetic CheckRun for computeCheckState
  // The rollup state can be: SUCCESS, FAILURE, PENDING, ERROR, EXPECTED
  let statusCheckRollup: any[] = []
  if (statusRollup?.state) {
    const rollupState = statusRollup.state
    // Map to CheckRun format: status=COMPLETED + conclusion
    let conclusion: string | null = null
    let status = "COMPLETED"
    
    switch (rollupState) {
      case "SUCCESS":
        conclusion = "SUCCESS"
        break
      case "FAILURE":
      case "ERROR":
        conclusion = "FAILURE"
        break
      case "PENDING":
      case "EXPECTED":
        status = "IN_PROGRESS"
        conclusion = null
        break
    }
    
    statusCheckRollup = [{
      __typename: "StatusContext",
      name: "Overall",
      status,
      conclusion,
    }]
  }

  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    isDraft: raw.isDraft,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    author: { login: raw.author?.login ?? "unknown" },
    reviewDecision: raw.reviewDecision,
    statusCheckRollup,
    commentCount: (raw.comments?.totalCount ?? 0) + (raw.reviews?.totalCount ?? 0),
    headRefOid: raw.headRefOid ?? null,
  }
}

/**
 * Fetch PRs from a single repository using direct fetch
 */
async function fetchRepoPRs(repo: string, token: string): Promise<PR[]> {
  const [owner, name] = repo.split("/")
  if (!owner || !name) return []

  const query = `query {
    repository(owner: "${owner}", name: "${name}") {
      nameWithOwner
      pullRequests(first: 50, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes { ${PR_FRAGMENT} }
      }
    }
  }`

  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) return []

    const result = await response.json() as { data?: { repository?: { pullRequests?: { nodes?: any[] } } } }
    const nodes = result.data?.repository?.pullRequests?.nodes
    if (!nodes) return []

    return nodes.filter(Boolean).map(transformGraphQLPR)
  } catch {
    return []
  }
}

/**
 * Fetch PRs from multiple repositories using GraphQL
 * Fetches all repos in parallel for maximum speed (~3s for 4 large repos)
 */
export async function listPRsGraphQL(repos: string[]): Promise<PR[]> {
  if (repos.length === 0) return []

  const token = await getToken()

  // Fetch ALL repos in parallel - each as a separate request
  // This avoids resource limits while maximizing speed
  const results = await Promise.allSettled(
    repos.map(repo => fetchRepoPRs(repo, token))
  )

  // Aggregate results
  const allPRs: PR[] = []
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPRs.push(...result.value)
    }
  }

  // Sort by updatedAt (most recent first)
  return allPRs.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/**
 * Fetch specific PRs by repo/number using GraphQL
 * More efficient than multiple individual REST calls
 */
export async function getPRsGraphQL(
  prs: Array<{ repo: string; number: number }>
): Promise<PR[]> {
  if (prs.length === 0) return []

  const token = await getToken()

  // Build a single query for all PRs (batched if needed)
  const BATCH_SIZE = 20
  const batches: Array<{ repo: string; number: number }>[] = []
  for (let i = 0; i < prs.length; i += BATCH_SIZE) {
    batches.push(prs.slice(i, i + BATCH_SIZE))
  }

  const batchResults = await Promise.allSettled(
    batches.map(async (batch) => {
      const prQueries = batch.map(({ repo, number }, index) => {
        const [owner, name] = repo.split("/")
        if (!owner || !name) return ""
        return `
          pr${index}: repository(owner: "${owner}", name: "${name}") {
            nameWithOwner
            pullRequest(number: ${number}) { ${PR_FRAGMENT} }
          }
        `
      }).filter(Boolean).join("\n")

      const query = `query { ${prQueries} }`

      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) return []

      const result = await response.json() as { data?: Record<string, { nameWithOwner?: string; pullRequest?: any }> }
      const fetchedPRs: PR[] = []

      for (const key of Object.keys(result.data || {})) {
        const repo = result.data![key]
        if (!repo?.pullRequest) continue
        fetchedPRs.push(transformGraphQLPR(repo.pullRequest))
      }

      return fetchedPRs
    })
  )

  const allPRs: PR[] = []
  for (const result of batchResults) {
    if (result.status === "fulfilled") {
      allPRs.push(...result.value)
    }
  }

  return allPRs
}
