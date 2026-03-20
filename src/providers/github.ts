/**
 * GitHub API provider using gh CLI
 * Uses GraphQL for bulk operations with REST fallback
 */

import { $ } from "bun"
import type { PR, PRPreview, ChangedFile, PRCommit, PRReview, PreviewCheckStatus, PreviewCheck, PreviewComment } from "../types"
import { listPRsGraphQL, getPRsGraphQL } from "./graphql"
import { isBot } from "../utils/bots"
import { logRequest } from "../utils/logger"

/** Fields to fetch from GitHub */
const PR_FIELDS = [
  "number",
  "title",
  "author",
  "url",
  "state",
  "isDraft",
  "createdAt",
  "updatedAt",
  "reviewDecision",
  "statusCheckRollup",
  "comments",
  "reviews",
  "headRefOid",
].join(",")

/** Raw PR from GitHub API (comments and reviews are arrays) */
interface RawPR extends Omit<PR, "commentCount"> {
  comments: unknown[]
  reviews: unknown[]
}

/** Transform raw GitHub PR to our PR type */
function transformPR(raw: RawPR): PR {
  const { comments, reviews, ...rest } = raw
  // Count both PR-level comments and review comments
  const commentCount = (comments?.length ?? 0) + (reviews?.length ?? 0)
  return {
    ...rest,
    commentCount,
  }
}

/** Transform array of raw PRs */
function transformPRs(raws: RawPR[]): PR[] {
  return raws.map(transformPR)
}

/**
 * List PRs from a specific repo or current repo
 * @param repo - Repository name (owner/repo)
 * @param state - PR state: "open" (default), "closed", "merged", or "all"
 */
export async function listPRs(repo?: string, state: "open" | "closed" | "merged" | "all" = "open"): Promise<PR[]> {
  const args = ["pr", "list", "--json", PR_FIELDS, "--limit", "50"]
  if (repo) args.push("-R", repo)
  if (state !== "open") args.push("--state", state)

  const log = logRequest("gh", `pr list ${repo ?? "(current)"} --state ${state}`)
  try {
    const result = await $`gh ${args}`.json()
    const prs = transformPRs(result as RawPR[])
    log.finish(`${prs.length} PRs`)
    return prs
  } catch (error) {
    log.fail(error)
    throw error
  }
}

/**
 * List closed PRs from a repo (recent, last 30 days by default)
 */
export async function listClosedPRs(repo: string, options?: { author?: string; days?: number }): Promise<PR[]> {
  return listPRsByState(repo, "closed", options)
}

/**
 * List merged PRs from a repo (recent, last 30 days by default)
 */
export async function listMergedPRs(repo: string, options?: { author?: string; days?: number }): Promise<PR[]> {
  return listPRsByState(repo, "merged", options)
}

/**
 * List PRs by state with optional author and date filtering.
 * Uses --search qualifier for date range to get recent PRs rather than oldest.
 */
async function listPRsByState(
  repo: string,
  state: "closed" | "merged",
  options?: { author?: string; days?: number }
): Promise<PR[]> {
  const days = options?.days ?? 30
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split("T")[0]

  const args = [
    "pr", "list",
    "-R", repo,
    "--json", PR_FIELDS,
    "--limit", "100",
    "--state", state,
    "--search", `updated:>=${sinceStr}`,
  ]
  if (options?.author) {
    args.push("--author", options.author)
  }

  const label = `pr list ${repo} --state ${state}${options?.author ? ` --author ${options.author}` : ""}`
  const log = logRequest("gh", label)
  try {
    const result = await $`gh ${args}`.json()
    const prs = transformPRs(result as RawPR[])
    log.finish(`${prs.length} PRs`)
    return prs
  } catch (error) {
    log.fail(error)
    return []
  }
}

/**
 * List PRs by a specific author across states.
 * Used for @user background fetch.
 */
export async function listPRsByAuthor(
  repo: string,
  author: string,
  state: "open" | "closed" | "merged" | "all" = "all"
): Promise<PR[]> {
  const args = [
    "pr", "list",
    "-R", repo,
    "--json", PR_FIELDS,
    "--limit", "50",
    "--author", author,
    "--state", state,
  ]

  const log = logRequest("gh", `pr list ${repo} --author ${author} --state ${state}`)
  try {
    const result = await $`gh ${args}`.json()
    const prs = transformPRs(result as RawPR[])
    log.finish(`${prs.length} PRs`)
    return prs
  } catch (error) {
    log.fail(error)
    return []
  }
}

/**
 * List PRs authored by the current user
 */
export async function listMyPRs(): Promise<PR[]> {
  const log = logRequest("gh", "pr list --author @me")
  const result = await $`gh pr list --author @me --json ${PR_FIELDS} --limit 50`.json()
  const prs = transformPRs(result as RawPR[])
  log.finish(`${prs.length} PRs`)
  return prs
}

/**
 * List PRs where review is requested from current user
 */
export async function listReviewRequests(): Promise<PR[]> {
  const log = logRequest("gh", "pr list --search review-requested:@me")
  const result =
    await $`gh pr list --search "review-requested:@me" --json ${PR_FIELDS} --limit 50`.json()
  const prs = transformPRs(result as RawPR[])
  log.finish(`${prs.length} PRs`)
  return prs
}

/**
 * List PRs from a repo, updated within the last N days
 */
export async function listRecentPRs(repo: string, days: number): Promise<PR[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split("T")[0]
  
  const args = [
    "pr", "list",
    "-R", repo,
    "--json", PR_FIELDS,
    "--limit", "100",
    "--search", `updated:>=${sinceStr}`,
  ]

  const log = logRequest("gh", `pr list ${repo} --recent ${days}d`)
  try {
    const result = await $`gh ${args}`.json()
    const prs = transformPRs(result as RawPR[])
    log.finish(`${prs.length} PRs`)
    return prs
  } catch (error) {
    log.fail(error)
    return []
  }
}

/**
 * List PRs from multiple repositories using GraphQL (with REST fallback)
 */
export async function listPRsFromRepos(repos: string[]): Promise<PR[]> {
  if (repos.length === 0) {
    // Default to current repo
    return listPRs()
  }

  const log = logRequest("graphql", `listPRsFromRepos (${repos.length} repos)`)
  try {
    // Use GraphQL for bulk fetching (single API call)
    const prs = await listPRsGraphQL(repos)
    log.finish(`${prs.length} PRs`)
    return prs
  } catch (error) {
    // Fallback to REST API (parallel calls per repo)
    log.fail(error)
    console.error("GraphQL bulk fetch failed, falling back to REST:", error)
    const log2 = logRequest("gh", `listPRsFromReposREST (${repos.length} repos)`)
    const prs = await listPRsFromReposREST(repos)
    log2.finish(`${prs.length} PRs`)
    return prs
  }
}

/**
 * List PRs from multiple repositories using REST API (fallback)
 */
async function listPRsFromReposREST(repos: string[]): Promise<PR[]> {
  // Fetch from all repos in parallel
  const results = await Promise.allSettled(repos.map((repo) => listPRs(repo)))

  // Aggregate successful results
  const allPRs: PR[] = []
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPRs.push(...result.value)
    }
  }

  // Sort by updatedAt (most recent first)
  return allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/**
 * List recent PRs from multiple repositories (fast initial load)
 */
export async function listRecentPRsFromRepos(repos: string[], days: number): Promise<PR[]> {
  if (repos.length === 0) {
    return listPRs()
  }

  // Fetch recent PRs from all repos in parallel
  const results = await Promise.allSettled(repos.map((repo) => listRecentPRs(repo, days)))

  // Aggregate successful results
  const allPRs: PR[] = []
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPRs.push(...result.value)
    }
  }

  // Sort by updatedAt (most recent first)
  return allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/**
 * Fetch a single PR by repo and number
 */
export async function getPR(repo: string, number: number): Promise<PR | null> {
  const log = logRequest("gh", `pr view ${repo}#${number}`)
  try {
    const result = await $`gh pr view ${number} -R ${repo} --json ${PR_FIELDS}`.json()
    log.finish()
    return transformPR(result as RawPR)
  } catch (error) {
    log.fail(error)
    return null
  }
}

/**
 * Fetch multiple specific PRs by repo/number using GraphQL (with REST fallback)
 */
export async function getPRsBulk(
  prs: Array<{ repo: string; number: number }>
): Promise<PR[]> {
  if (prs.length === 0) return []

  const log = logRequest("graphql", `getPRsBulk (${prs.length} PRs)`)
  try {
    // Use GraphQL for efficient bulk fetch
    const result = await getPRsGraphQL(prs)
    log.finish(`${result.length} PRs`)
    return result
  } catch (error) {
    // Fallback to individual REST calls
    log.fail(error)
    console.error("GraphQL bulk PR fetch failed, falling back to REST:", error)
    const log2 = logRequest("gh", `getPRsBulk REST fallback (${prs.length} PRs)`)
    const results = await Promise.all(
      prs.map(({ repo, number }) => getPR(repo, number))
    )
    const found = results.filter((pr): pr is PR => pr !== null)
    log2.finish(`${found.length} PRs`)
    return found
  }
}

/**
 * Get current GitHub username
 */
export async function getCurrentUser(): Promise<string> {
  const log = logRequest("gh", "api user")
  const result = await $`gh api user --jq .login`.text()
  log.finish(result.trim())
  return result.trim()
}

/**
 * Get current repository name (owner/repo)
 */
export async function getCurrentRepo(): Promise<string | null> {
  const log = logRequest("gh", "repo view")
  try {
    const result = await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.text()
    log.finish(result.trim())
    return result.trim()
  } catch (error) {
    log.fail(error)
    return null
  }
}

// ============================================================================
// PR Preview (spec 014)
// ============================================================================

/** Fields to fetch for PR preview */
const PREVIEW_FIELDS = [
  "title",
  "state",
  "isDraft",
  "additions",
  "deletions",
  "files",
  "commits",
  "author",
  "reviews",
  "reviewRequests",
  "statusCheckRollup",
  "body",
  "baseRefName",
  "headRefName",
  "mergeable",
  "comments",
  "createdAt",
].join(",")

/**
 * Fetch detailed PR preview data
 */
export async function fetchPRPreview(repo: string, number: number): Promise<PRPreview> {
  const log = logRequest("gh", `pr preview ${repo}#${number}`)
  const result = await $`gh pr view ${number} -R ${repo} --json ${PREVIEW_FIELDS}`.json()

  // Calculate total additions/deletions
  const files = parseFiles(result.files)
  const additions = result.additions ?? files.reduce((sum, f) => sum + f.additions, 0)
  const deletions = result.deletions ?? files.reduce((sum, f) => sum + f.deletions, 0)

  const preview = {
    repo,
    number,
    title: result.title ?? "",
    state: result.state ?? "OPEN",
    isDraft: result.isDraft ?? false,
    files,
    additions,
    deletions,
    commits: parseCommits(result.commits),
    author: {
      login: result.author?.login ?? "unknown",
      createdAt: result.createdAt ?? "",
    },
    reviews: dedupeReviews(result.reviews ?? []),
    requestedReviewers: parseRequestedReviewers(result.reviewRequests ?? []),
    checks: parsePreviewChecks(result.statusCheckRollup),
    body: result.body ?? "",
    baseRef: result.baseRefName ?? "",
    headRef: result.headRefName ?? "",
    mergeable: result.mergeable ?? "UNKNOWN",
    commentCount: result.comments?.length ?? 0,
    reviewCommentCount: 0, // Not available via gh CLI
    recentComments: parseRecentComments(result.comments ?? [], result.reviews ?? []),
  }
  log.finish(`${files.length} files, +${additions}/-${deletions}`)
  return preview
}

function parseFiles(files: any[]): ChangedFile[] {
  if (!files) return []
  return files.map((f) => ({
    path: f.path ?? "",
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
    status: mapFileStatus(f.status),
  }))
}

function mapFileStatus(status: string): ChangedFile["status"] {
  switch (status?.toLowerCase()) {
    case "added":
      return "added"
    case "deleted":
    case "removed":
      return "deleted"
    case "renamed":
      return "renamed"
    default:
      return "modified"
  }
}

function parseCommits(commits: any[]): PRCommit[] {
  if (!commits) return []
  return commits.map((c) => ({
    oid: (c.oid ?? "").slice(0, 7),
    message: c.messageHeadline ?? c.message?.split("\n")[0] ?? "",
    author: c.authors?.[0]?.login ?? c.author?.login ?? "unknown",
    committedAt: c.committedDate ?? "",
  }))
}

/** Parse requested reviewers list */
function parseRequestedReviewers(reviewRequests: any[]): string[] {
  if (!reviewRequests) return []
  return reviewRequests
    .map((r: any) => r.login ?? r.name ?? null)
    .filter((login: string | null): login is string => login !== null)
}

/** Keep only latest review per author */
function dedupeReviews(reviews: any[]): PRReview[] {
  const byAuthor = new Map<string, any>()
  for (const r of reviews) {
    if (!r.author?.login) continue
    const existing = byAuthor.get(r.author.login)
    if (!existing || new Date(r.submittedAt) > new Date(existing.submittedAt)) {
      byAuthor.set(r.author.login, r)
    }
  }
  return [...byAuthor.values()].map((r) => ({
    author: r.author.login,
    state: r.state ?? "PENDING",
    submittedAt: r.submittedAt ?? "",
  }))
}

/** Parse recent comments from PR comments and review bodies (excludes bots) */
function parseRecentComments(comments: any[], reviews: any[]): PreviewComment[] {
  const all: PreviewComment[] = []

  // PR-level comments (skip bots)
  for (const c of comments ?? []) {
    const author = c.author?.login ?? "unknown"
    if (isBot(author)) continue
    if (c.body?.trim()) {
      all.push({
        author,
        body: c.body,
        createdAt: c.createdAt ?? "",
        isReviewComment: false,
      })
    }
  }

  // Review comments (from review body, not inline diff comments) - skip bots
  for (const r of reviews ?? []) {
    const author = r.author?.login ?? "unknown"
    if (isBot(author)) continue
    if (r.body?.trim()) {
      all.push({
        author,
        body: r.body,
        createdAt: r.submittedAt ?? "",
        isReviewComment: true,
      })
    }
  }

  // Sort by date descending (newest first), take top 5
  return all
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
}

function parsePreviewChecks(rollup: any[]): PreviewCheckStatus {
  if (!rollup || rollup.length === 0) {
    return { overall: "neutral", checks: [] }
  }

  const checks: PreviewCheck[] = rollup.map((c) => ({
    name: c.name || c.context || "unknown",
    status: mapPreviewCheckStatus(c.status, c.conclusion, c.state),
  }))

  const hasFailure = checks.some((c) => c.status === "failure")
  const hasPending = checks.some((c) => c.status === "pending")
  const overall = hasFailure ? "failure" : hasPending ? "pending" : "success"

  return { overall, checks }
}

function mapPreviewCheckStatus(
  status?: string,
  conclusion?: string,
  state?: string
): PreviewCheck["status"] {
  // Handle StatusContext (has state instead of status/conclusion)
  if (state) {
    switch (state) {
      case "SUCCESS":
        return "success"
      case "FAILURE":
      case "ERROR":
        return "failure"
      case "PENDING":
      case "EXPECTED":
        return "pending"
      default:
        return "neutral"
    }
  }

  // Handle CheckRun
  if (status === "COMPLETED") {
    switch (conclusion) {
      case "SUCCESS":
        return "success"
      case "FAILURE":
      case "TIMED_OUT":
      case "STARTUP_FAILURE":
        return "failure"
      default:
        return "neutral"
    }
  }

  if (status === "IN_PROGRESS" || status === "QUEUED" || status === "PENDING" || status === "WAITING") {
    return "pending"
  }

  return "neutral"
}
