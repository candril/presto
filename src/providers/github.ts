/**
 * GitHub API provider using gh CLI
 */

import { $ } from "bun"
import type { PR, PRPreview, ChangedFile, PRCommit, PRReview, PreviewCheckStatus, PreviewCheck } from "../types"

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
].join(",")

/**
 * List PRs from a specific repo or current repo
 */
export async function listPRs(repo?: string): Promise<PR[]> {
  const args = ["pr", "list", "--json", PR_FIELDS, "--limit", "50"]
  if (repo) args.push("-R", repo)

  const result = await $`gh ${args}`.json()
  return result as PR[]
}

/**
 * List PRs authored by the current user
 */
export async function listMyPRs(): Promise<PR[]> {
  const result = await $`gh pr list --author @me --json ${PR_FIELDS} --limit 50`.json()
  return result as PR[]
}

/**
 * List PRs where review is requested from current user
 */
export async function listReviewRequests(): Promise<PR[]> {
  const result =
    await $`gh pr list --search "review-requested:@me" --json ${PR_FIELDS} --limit 50`.json()
  return result as PR[]
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
    return result as PR[]
  } catch {
    return []
  }
}

/**
 * List PRs from multiple repositories
 */
export async function listPRsFromRepos(repos: string[]): Promise<PR[]> {
  if (repos.length === 0) {
    // Default to current repo
    return listPRs()
  }

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
    return result as PR
  } catch {
    return null
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
  "files",
  "commits",
  "author",
  "reviews",
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

  return {
    repo,
    files: parseFiles(result.files),
    commits: parseCommits(result.commits),
    author: {
      login: result.author?.login ?? "unknown",
      createdAt: result.createdAt ?? "",
    },
    reviews: dedupeReviews(result.reviews ?? []),
    checks: parsePreviewChecks(result.statusCheckRollup),
    body: result.body ?? "",
    baseRef: result.baseRefName ?? "",
    headRef: result.headRefName ?? "",
    mergeable: result.mergeable ?? "UNKNOWN",
    commentCount: result.comments?.length ?? 0,
    reviewCommentCount: 0, // Not available via gh CLI
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
