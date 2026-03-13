/**
 * GitHub API provider using gh CLI
 */

import { $ } from "bun"
import type { PR } from "../types"

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
