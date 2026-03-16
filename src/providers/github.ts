/**
 * GitHub API provider using gh CLI
 * Uses GraphQL for bulk operations with REST fallback
 */

import { $ } from "bun"
import type { PR, PRPreview, ChangedFile, PRCommit, PRReview, PreviewCheckStatus, PreviewCheck, PreviewComment } from "../types"
import { listPRsGraphQL, getPRsGraphQL } from "./graphql"

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
 */
export async function listPRs(repo?: string): Promise<PR[]> {
  const args = ["pr", "list", "--json", PR_FIELDS, "--limit", "50"]
  if (repo) args.push("-R", repo)

  const result = await $`gh ${args}`.json()
  return transformPRs(result as RawPR[])
}

/**
 * List PRs authored by the current user
 */
export async function listMyPRs(): Promise<PR[]> {
  const result = await $`gh pr list --author @me --json ${PR_FIELDS} --limit 50`.json()
  return transformPRs(result as RawPR[])
}

/**
 * List PRs where review is requested from current user
 */
export async function listReviewRequests(): Promise<PR[]> {
  const result =
    await $`gh pr list --search "review-requested:@me" --json ${PR_FIELDS} --limit 50`.json()
  return transformPRs(result as RawPR[])
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

  try {
    const result = await $`gh ${args}`.json()
    return transformPRs(result as RawPR[])
  } catch {
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

  try {
    // Use GraphQL for bulk fetching (single API call)
    return await listPRsGraphQL(repos)
  } catch (error) {
    // Fallback to REST API (parallel calls per repo)
    console.error("GraphQL bulk fetch failed, falling back to REST:", error)
    return listPRsFromReposREST(repos)
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
  try {
    const result = await $`gh pr view ${number} -R ${repo} --json ${PR_FIELDS}`.json()
    return transformPR(result as RawPR)
  } catch {
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

  try {
    // Use GraphQL for efficient bulk fetch
    return await getPRsGraphQL(prs)
  } catch (error) {
    // Fallback to individual REST calls
    console.error("GraphQL bulk PR fetch failed, falling back to REST:", error)
    const results = await Promise.all(
      prs.map(({ repo, number }) => getPR(repo, number))
    )
    return results.filter((pr): pr is PR => pr !== null)
  }
}

/**
 * Get current GitHub username
 */
export async function getCurrentUser(): Promise<string> {
  const result = await $`gh api user --jq .login`.text()
  return result.trim()
}

/**
 * Get current repository name (owner/repo)
 */
export async function getCurrentRepo(): Promise<string | null> {
  try {
    const result = await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.text()
    return result.trim()
  } catch {
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
  const result = await $`gh pr view ${number} -R ${repo} --json ${PREVIEW_FIELDS}`.json()

  // Calculate total additions/deletions
  const files = parseFiles(result.files)
  const additions = result.additions ?? files.reduce((sum, f) => sum + f.additions, 0)
  const deletions = result.deletions ?? files.reduce((sum, f) => sum + f.deletions, 0)

  return {
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

/** Parse recent comments from PR comments and review bodies */
function parseRecentComments(comments: any[], reviews: any[]): PreviewComment[] {
  const all: PreviewComment[] = []

  // PR-level comments
  for (const c of comments ?? []) {
    if (c.body?.trim()) {
      all.push({
        author: c.author?.login ?? "unknown",
        body: c.body,
        createdAt: c.createdAt ?? "",
        isReviewComment: false,
      })
    }
  }

  // Review comments (from review body, not inline diff comments)
  for (const r of reviews ?? []) {
    if (r.body?.trim()) {
      all.push({
        author: r.author?.login ?? "unknown",
        body: r.body,
        createdAt: r.submittedAt ?? "",
        isReviewComment: true,
      })
    }
  }

  // Sort by date descending, take last 5, then reverse to show oldest first
  return all
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .reverse()
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
