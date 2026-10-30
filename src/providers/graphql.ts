/**
 * GraphQL API provider for bulk PR fetching
 * Uses direct fetch to GitHub's GraphQL API for maximum speed
 */

import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName, toMergeMethod } from "../types"
import { isBot } from "../utils/bots"
import { stampBaseUpdateRequired } from "./branchRules"
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
  baseRefName
  mergeStateStatus
  isCrossRepository
  viewerCanUpdateBranch
  autoMergeRequest { mergeMethod }
  reviewThreads(first: 50) {
    totalCount
    nodes {
      isResolved
      comments(first: 1) { totalCount nodes { author { login __typename } } }
    }
  }
  comments(first: 100) {
    totalCount
    nodes { author { login } }
  }
  reviews(first: 50) {
    totalCount
    nodes { author { login } }
  }
  latestOpinionatedReviews(first: 10) {
    nodes { state author { login } }
  }
  commits(last: 1) {
    nodes {
      commit {
        oid
        committedDate
        statusCheckRollup { state }
        checkSuites(first: 20) { nodes { status } }
      }
    }
  }
`

/**
 * The cheap half of a refresh.
 *
 * `PR_FRAGMENT` costs 28 of the 5,000 GraphQL points GitHub grants an hour,
 * measured against Dg.GalaxusAbos — every count it derives needs the authors
 * behind it, and authors only come one node at a time. Three repos on a 300s
 * interval spend 1,008 points an hour on nothing but asking.
 *
 * This fragment is what a refresh needs in order to decide whether the
 * expensive one is worth sending. It costs 1 point: the only connection
 * carrying nodes is `commits(last: 1)`, and a `totalCount` with no
 * `first`/`last` returns no nodes at all, so the three counts are free.
 *
 * A PR's `updatedAt` alone would not do. GitHub leaves it untouched when a
 * check run finishes or a review lands, which is exactly the movement a PR
 * dashboard exists to show — hence the head oid, the rollup state and the
 * review decision alongside it.
 *
 * `mergeStateStatus` stays out, though falling behind base moves nothing
 * else. GitHub computes it per PR on request: on isomorph it is 6.7s of an
 * 8s probe, and since main moves all the time there it flips on most
 * refreshes anyway, which would defeat the skip it is paid for. A PR that
 * only fell behind shows it on the next refresh that fetches in full.
 */
const PR_DIGEST_FRAGMENT = `
  number
  updatedAt
  isDraft
  reviewDecision
  comments { totalCount }
  reviews { totalCount }
  reviewThreads { totalCount }
  commits(last: 1) {
    nodes { commit { oid statusCheckRollup { state } } }
  }
`

/**
 * Resolving a review thread moves none of the digest fields — GitHub treats
 * it as neither an update nor a new comment. An unresolved-thread badge can
 * therefore sit one or more ticks behind until something else on the PR
 * moves; `r` forces a full fetch and settles it.
 */
export function digestOf(nodes: any[]): string {
  return nodes
    .filter(Boolean)
    .map((pr) => {
      const commit = pr.commits?.nodes?.[0]?.commit
      return [
        pr.number,
        pr.updatedAt,
        pr.isDraft,
        pr.reviewDecision ?? "",
        pr.comments?.totalCount ?? 0,
        pr.reviews?.totalCount ?? 0,
        pr.reviewThreads?.totalCount ?? 0,
        commit?.oid ?? "",
        commit?.statusCheckRollup?.state ?? "",
      ].join("|")
    })
    .sort()
    .join("\n")
}

/**
 * Each repo's last full fetch and the digest it was taken at, so the next
 * refresh can tell whether anything moved. Module state for the same reason
 * the token is: presto runs one of these per process, and the alternative is
 * threading a cache through every caller for no gain.
 *
 * The PRs are kept beside the digest because "unchanged" is only true of the
 * fetch the digest was taken from. Leaving the caller to supply them from
 * whatever it has on screen breaks as soon as that list has been narrowed —
 * a tab's repo filter, a refresh that had only landed its first half — and
 * the repo's PRs then vanish until something in it moves.
 */
const lastFetches = new Map<string, { digest: string; prs: PR[] }>()

/** Comment tallies derived from one PR's conversation, reviews and review threads */
export interface CommentCounts {
  /** Every human comment: PR-level, review bodies, and review-thread comments */
  total: number
  /**
   * Comments still waiting on someone: those inside an unresolved review thread. A
   * conversation comment or a review body cannot be resolved and needs no answer once
   * read, so counting those as open would just reproduce the total.
   */
  open: number
  unresolvedThreads: number
}

/**
 * Copilot's auto-review opens threads like a person would — 22% of open threads in these
 * repos — but a bot suggestion is not the team blocking the PR, and presto already
 * discounts bots elsewhere (spec 024). GraphQL's __typename settles it where the name
 * patterns cannot: "copilot-pull-request-reviewer" looks human to isBot().
 */
export function countComments(raw: any): CommentCounts {
  const humanAuthored = (entry: any) => !isBot(entry?.author?.login ?? "")
  const humanThreads = (raw?.reviewThreads?.nodes ?? []).filter((thread: any) => {
    const author = thread?.comments?.nodes?.[0]?.author
    return author?.__typename !== "Bot" && !isBot(author?.login ?? "")
  })
  const threadComments = (threads: any[]) =>
    threads.reduce((sum: number, thread: any) => sum + (thread?.comments?.totalCount ?? 0), 0)
  const unresolved = humanThreads.filter((thread: any) => thread?.isResolved === false)

  return {
    total:
      (raw?.comments?.nodes ?? []).filter(humanAuthored).length +
      (raw?.reviews?.nodes ?? []).filter(humanAuthored).length +
      threadComments(humanThreads),
    open: threadComments(unresolved),
    unresolvedThreads: unresolved.length,
  }
}

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

  const counts = countComments(raw)

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
    commentCount: counts.total,
    openCommentCount: counts.open,
    headRefOid: raw.headRefOid ?? null,
    headCommittedAt: raw.commits?.nodes?.[0]?.commit?.committedDate ?? null,
    approvedBy: (raw.latestOpinionatedReviews?.nodes ?? [])
      .filter((review: any) => review?.state === "APPROVED" && !isBot(review?.author?.login ?? ""))
      .map((review: any) => review.author.login),
    unresolvedThreads: counts.unresolvedThreads,
    // Only meaningful when nothing has started: these repos keep suites (renovate,
    // terraform) parked in QUEUED indefinitely, so a queued suite alone proves nothing.
    checksQueued:
      !statusRollup?.state &&
      (raw.commits?.nodes?.[0]?.commit?.checkSuites?.nodes ?? []).some(
        (suite: any) =>
          suite?.status === "QUEUED" || suite?.status === "REQUESTED" || suite?.status === "PENDING"
      ),
    headRefName: raw.headRefName ?? null,
    mergeStateStatus: raw.mergeStateStatus ?? null,
    autoMergeMethod: toMergeMethod(raw.autoMergeRequest?.mergeMethod),
    baseRefName: raw.baseRefName ?? null,
    // A fork PR reports viewerCanUpdateBranch false because the viewer cannot push to
    // the fork, which says nothing about whether it is behind
    baseSync: raw.isCrossRepository === true
      ? "unknown"
      : raw.viewerCanUpdateBranch === true
        ? "behind"
        : "up-to-date",
    // Filled in by stampBaseUpdateRequired once the branch rules are known
    baseUpdateRequired: raw.mergeStateStatus === "BEHIND",
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

/** GitHub rejects a search query string longer than this */
const SEARCH_QUERY_LIMIT = 256

/**
 * Search query strings covering `authors`' open PRs in `repo`, split so none passes
 * GitHub's length limit. Each string is a separate search, so each one is paid for.
 */
export function authorSearchQueries(repo: string, authors: string[]): string[] {
  const base = `repo:${repo} is:pr is:open sort:updated-desc`
  const queries: string[] = []
  let current = base
  for (const author of authors) {
    const qualifier = ` author:${author}`
    if (current !== base && current.length + qualifier.length > SEARCH_QUERY_LIMIT) {
      queries.push(current)
      current = base
    }
    current += qualifier
  }
  queries.push(current)
  return queries
}

/**
 * The open PRs of `repo` with `fields`, or with `authors` only those they opened.
 *
 * The author-scoped form is a search rather than a filter on the repository listing,
 * which has none: on isomorph the 50 most recently updated of 264 open PRs held 2 of
 * the 13 by starred authors, and asking for the rest that way means paying for all of them.
 */
function openPRsQuery(repo: string, fields: string, authors?: string[]): string {
  if (authors) {
    const searches = authorSearchQueries(repo, authors).map(
      (q, index) => `s${index}: search(type: ISSUE, first: 50, query: ${JSON.stringify(q)}) {
        nodes { ... on PullRequest { ${fields} } }
      }`
    )
    return `query { ${searches.join("\n")} }`
  }

  const [owner, name] = repo.split("/")
  return `query {
    repository(owner: "${owner}", name: "${name}") {
      pullRequests(first: 50, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes { ${fields} }
      }
    }
  }`
}

/**
 * Single GraphQL round-trip for one repo, at full 28-point depth.
 *
 * `PR_FRAGMENT` carries every field `digestOf` reads, so the digest comes from
 * the same answer as the PRs and no probe is needed to start one.
 */
async function fetchRepoPRsOnce(
  repo: string,
  token: string,
  authors?: string[]
): Promise<{ prs: PR[]; digest: string }> {
  const nodes = await fetchRepoNodes(openPRsQuery(repo, PR_FRAGMENT, authors), token)
  return { prs: nodes.map(transformGraphQLPR), digest: digestOf(nodes) }
}

/**
 * POST one repository or search query and hand back its pull request nodes.
 *
 * Throws on every failure mode — GitHub reports rate limits and outages as
 * HTTP 200 with an `errors` body, and returning [] for those is
 * indistinguishable from "no open PRs", which then overwrites good cached
 * data with nothing.
 */
async function fetchRepoNodes(query: string, token: string): Promise<any[]> {
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
    data?: Record<string, any> | null
    errors?: Array<{ type?: string; message?: string }>
  }

  const nodes = pullRequestNodes(result.data)
  if (!nodes) {
    const error = result.errors?.[0]
    const detail = error ? `${error.type ?? "ERROR"}: ${error.message ?? ""}`.trim() : "no data returned"
    throw new RepoFetchError(detail, isRetryableGraphQLError(error?.type))
  }

  return nodes.filter(Boolean)
}

/** The nodes of a repository listing, or of every aliased search; null when any is missing */
function pullRequestNodes(data: Record<string, any> | null | undefined): any[] | null {
  if (!data) return null
  if ("repository" in data) return data.repository?.pullRequests?.nodes ?? null

  const searches = Object.values(data)
  if (searches.length === 0 || searches.some((search) => !search?.nodes)) return null
  return searches.flatMap((search) => search.nodes)
}

/**
 * Ask a repo what its open PRs look like from outside, for 1 GraphQL point.
 * Equal to the repo's last digest means nothing on any PR has moved, and the
 * 28-point fetch would produce exactly what the caller already holds.
 */
async function probeRepo(repo: string, token: string, authors?: string[]): Promise<string> {
  return digestOf(await fetchRepoNodes(openPRsQuery(repo, PR_DIGEST_FRAGMENT, authors), token))
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
 * Fetch PRs from a single repository, retrying transient failures.
 *
 * Probes for 1 point and only pays the other 28 when the digest moved. With
 * no earlier digest to compare against (the first fetch, a failed last one)
 * or under `force`, the probe could not skip anything: it goes straight to the
 * full fetch, which yields the digest for the next refresh itself. On
 * Dg.GalaxusAbos that is 1.5s of a 5s first refresh.
 *
 * The digest is stored only once the fetch succeeds. A fetch that died after
 * stamping it would leave the next refresh skipping a repo whose PRs presto
 * never actually loaded.
 *
 * `authors` narrows the fetch to their PRs. It is part of the cache key: a
 * scoped and an unscoped fetch of one repo hold different PRs, and either
 * standing in for the other would show the wrong set as "unchanged".
 */
export async function fetchRepoPRs(
  repo: string,
  token: string,
  force: boolean,
  authors?: string[]
): Promise<{ prs: PR[]; unchanged: boolean }> {
  const [owner, name] = repo.split("/")
  if (!owner || !name) throw new RepoFetchError(`invalid repo name "${repo}"`, false)
  if (authors?.length === 0) return { prs: [], unchanged: false }

  const cacheKey = authors ? `${repo}|${[...authors].sort().join(",")}` : repo
  const log = logRequest("graphql", `fetchRepoPRs ${repo}${authors ? ` (${authors.length} authors)` : ""}`)
  for (let attempt = 1; ; attempt++) {
    try {
      const last = force ? undefined : lastFetches.get(cacheKey)
      if (last && last.digest === (await probeRepo(repo, token, authors))) {
        log.finish("unchanged (1pt)")
        return { prs: last.prs, unchanged: true }
      }

      const { prs, digest } = await fetchRepoPRsOnce(repo, token, authors)
      lastFetches.set(cacheKey, { digest, prs })
      log.finish(`${prs.length} PRs`)
      return { prs, unchanged: false }
    } catch (error) {
      const retryable = error instanceof RepoFetchError ? error.retryable : true
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        lastFetches.delete(cacheKey)
        log.fail(error)
        throw error
      }
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }
}

/** PRs fetched, plus the repos that produced none and why */
export interface RepoFetchResult {
  prs: PR[]
  failedRepos: string[]
  /** Repos the probe cleared; their PRs in `prs` are the ones last fetched. */
  unchangedRepos: string[]
}

export interface ListReposOptions {
  force?: boolean
  /** Repos to fetch only these authors' PRs from, keyed by repo name */
  authorScopes?: Record<string, string[]>
  /**
   * Called with a repo's PRs as soon as that repo has answered and they differ from the
   * last fetch. One slow repo would otherwise hold back every other repo's rows.
   */
  onRepo?: (repo: string, prs: PR[]) => void
}

/**
 * Fetch PRs from multiple repositories using GraphQL
 * Fetches all repos in parallel for maximum speed (~3s for 4 large repos)
 */
export async function listPRsGraphQL(
  repos: string[],
  { force = false, authorScopes = {}, onRepo }: ListReposOptions = {}
): Promise<RepoFetchResult> {
  if (repos.length === 0) return { prs: [], failedRepos: [], unchangedRepos: [] }

  const token = await getToken()

  // Fetch ALL repos in parallel - each as a separate request
  // This avoids resource limits while maximizing speed
  const results = await Promise.allSettled(
    repos.map(async (repo) => {
      const result = await fetchRepoPRs(repo, token, force, authorScopes[repo])
      if (onRepo && !result.unchanged) {
        onRepo(repo, await stampBaseUpdateRequired(result.prs, getRepoName))
      }
      return result
    })
  )

  const allPRs: PR[] = []
  const failedRepos: string[] = []
  const unchangedRepos: string[] = []
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failedRepos.push(repos[index])
    } else {
      allPRs.push(...result.value.prs)
      if (result.value.unchanged) unchangedRepos.push(repos[index])
    }
  })

  await stampBaseUpdateRequired(allPRs, getRepoName)

  // Sort by updatedAt (most recent first)
  allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return { prs: allPRs, failedRepos, unchangedRepos }
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

  await stampBaseUpdateRequired(allPRs, getRepoName)
  return allPRs
}
