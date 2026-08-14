/**
 * GraphQL API provider for bulk PR fetching
 * Uses direct fetch to GitHub's GraphQL API for maximum speed
 */

import { $ } from "bun"
import type { PR } from "../types"
import { isBot } from "../utils/bots"
import { logRequest } from "../utils/logger"

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
  author { login ... on User { name } }
  reviewDecision
  headRefOid
  headRefName
  comments(first: 100) {
    nodes { author { login } }
  }
  reviews(first: 50) {
    nodes { author { login } }
  }
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

  // Count non-bot comments
  const prComments = raw.comments?.nodes ?? []
  const reviewComments = raw.reviews?.nodes ?? []
  
  const humanCommentCount = 
    prComments.filter((c: any) => !isBot(c?.author?.login ?? "")).length +
    reviewComments.filter((r: any) => !isBot(r?.author?.login ?? "")).length

  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    isDraft: raw.isDraft,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    author: { login: raw.author?.login ?? "unknown", name: raw.author?.name ?? null },
    reviewDecision: raw.reviewDecision,
    statusCheckRollup,
    commentCount: humanCommentCount,
    headRefOid: raw.headRefOid ?? null,
    headRefName: raw.headRefName ?? null,
  }
}

/** A repo fetch that failed — distinct from a repo that genuinely has no open PRs */
export class RepoFetchError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = "RepoFetchError"
  }
}

/** Statuses worth a second attempt: rate limiting and transient GitHub outages */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 400

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Single GraphQL round-trip for one repo.
 * Throws on every failure mode — GitHub reports rate limits and outages as
 * HTTP 200 with an `errors` body, and returning [] for those is indistinguishable
 * from "no open PRs", which then overwrites good cached data with nothing.
 */
async function fetchRepoPRsOnce(repo: string, token: string): Promise<PR[]> {
  const [owner, name] = repo.split("/")

  const query = `query {
    repository(owner: "${owner}", name: "${name}") {
      nameWithOwner
      pullRequests(first: 50, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes { ${PR_FRAGMENT} }
      }
    }
  }`

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).catch((error) => {
    throw new RepoFetchError(`network error: ${error instanceof Error ? error.message : error}`, true)
  })

  if (!response.ok) {
    throw new RepoFetchError(`HTTP ${response.status}`, RETRYABLE_STATUS.has(response.status))
  }

  const result = await response.json().catch(() => {
    throw new RepoFetchError("malformed response body", true)
  }) as {
    data?: { repository?: { pullRequests?: { nodes?: any[] } } | null }
    errors?: Array<{ type?: string; message?: string }>
  }

  const nodes = result.data?.repository?.pullRequests?.nodes
  if (!nodes) {
    const error = result.errors?.[0]
    const detail = error ? `${error.type ?? "ERROR"}: ${error.message ?? ""}`.trim() : "no data returned"
    throw new RepoFetchError(detail, isRetryableGraphQLError(error?.type))
  }

  return nodes.filter(Boolean).map(transformGraphQLPR)
}

/**
 * RATE_LIMITED and permission/lookup errors won't resolve by retrying immediately;
 * unclassified errors are GitHub's generic "something went wrong", which usually does.
 */
function isRetryableGraphQLError(type?: string): boolean {
  if (!type) return true
  return type !== "RATE_LIMITED" && type !== "NOT_FOUND" && type !== "FORBIDDEN"
}

/**
 * Fetch PRs from a single repository, retrying transient failures
 */
async function fetchRepoPRs(repo: string, token: string): Promise<PR[]> {
  const [owner, name] = repo.split("/")
  if (!owner || !name) throw new RepoFetchError(`invalid repo name "${repo}"`, false)

  const log = logRequest("graphql", `fetchRepoPRs ${repo}`)
  for (let attempt = 1; ; attempt++) {
    try {
      const prs = await fetchRepoPRsOnce(repo, token)
      log.finish(`${prs.length} PRs`)
      return prs
    } catch (error) {
      const retryable = error instanceof RepoFetchError ? error.retryable : true
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        log.fail(error)
        throw error
      }
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }
}

/** PRs fetched plus the repos that could not be fetched at all */
export interface RepoFetchResult {
  prs: PR[]
  failedRepos: string[]
}

/**
 * Fetch PRs from multiple repositories using GraphQL
 * Fetches all repos in parallel for maximum speed (~3s for 4 large repos)
 */
export async function listPRsGraphQL(repos: string[]): Promise<RepoFetchResult> {
  if (repos.length === 0) return { prs: [], failedRepos: [] }

  const token = await getToken()

  // Fetch ALL repos in parallel - each as a separate request
  // This avoids resource limits while maximizing speed
  const results = await Promise.allSettled(
    repos.map(repo => fetchRepoPRs(repo, token))
  )

  const allPRs: PR[] = []
  const failedRepos: string[] = []
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      allPRs.push(...result.value)
    } else {
      failedRepos.push(repos[index])
    }
  })

  // Sort by updatedAt (most recent first)
  allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return { prs: allPRs, failedRepos }
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
    batches.map(async (batch, batchIndex) => {
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

      const log = logRequest("graphql", `getPRsBatch ${batchIndex + 1}/${batches.length} (${batch.length} PRs)`)
      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        log.fail(`HTTP ${response.status}`)
        return []
      }

      const result = await response.json() as { data?: Record<string, { nameWithOwner?: string; pullRequest?: any }> }
      const fetchedPRs: PR[] = []

      for (const key of Object.keys(result.data || {})) {
        const repo = result.data![key]
        if (!repo?.pullRequest) continue
        fetchedPRs.push(transformGraphQLPR(repo.pullRequest))
      }

      log.finish(`${fetchedPRs.length} PRs`)
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
