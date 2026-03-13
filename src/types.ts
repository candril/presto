/**
 * Type definitions for presto
 */

// View modes for the application
export type View = "list" | "detail"

/**
 * Pull Request from GitHub API
 */
export interface PR {
  number: number
  title: string
  author: {
    login: string
  }
  /** Full URL of the PR */
  url: string
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  createdAt: string
  updatedAt: string
  reviewDecision: ReviewDecision | null
  statusCheckRollup: StatusCheckRollup | null
}

/** Helper to get full repo name from PR URL */
export function getRepoName(pr: PR): string {
  // URL format: https://github.com/owner/repo/pull/123
  const match = pr.url.match(/github\.com\/([^/]+\/[^/]+)\/pull/)
  return match?.[1] || "unknown"
}

/** Helper to get short repo name (without owner) */
export function getShortRepoName(pr: PR): string {
  const fullName = getRepoName(pr)
  return fullName.split("/")[1] || fullName
}

/** Review decision status */
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED"

/** CI/CD check status */
export interface StatusCheckRollup {
  state: CheckState
}

export type CheckState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR"

/**
 * Application state
 */
export interface AppState {
  view: View
  prs: PR[]
  selectedIndex: number
  loading: boolean
  error: string | null
}
