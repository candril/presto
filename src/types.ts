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

/** Individual check run from GitHub */
export interface CheckRun {
  __typename: "CheckRun" | "StatusContext"
  name: string
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "WAITING" | "PENDING" | "REQUESTED"
  conclusion: CheckConclusion | null
  workflowName?: string
}

/** Check conclusion values from GitHub */
export type CheckConclusion =
  | "SUCCESS"
  | "FAILURE"
  | "SKIPPED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "ACTION_REQUIRED"
  | "NEUTRAL"
  | "STALE"
  | "STARTUP_FAILURE"

/** CI/CD check status - array of check runs */
export type StatusCheckRollup = CheckRun[]

/** Computed overall check state for display */
export type CheckState = "SUCCESS" | "FAILURE" | "PENDING" | "NONE"

/**
 * Compute overall check state from array of check runs
 * - FAILURE if any check failed
 * - PENDING if any check is still running
 * - SUCCESS if all checks passed (ignoring skipped)
 * - NONE if no checks
 */
export function computeCheckState(checks: StatusCheckRollup | null): CheckState {
  if (!checks || checks.length === 0) return "NONE"

  let hasSuccess = false
  for (const check of checks) {
    // Check if still running
    if (check.status !== "COMPLETED") {
      return "PENDING"
    }
    // Check conclusion
    switch (check.conclusion) {
      case "FAILURE":
      case "TIMED_OUT":
      case "STARTUP_FAILURE":
        return "FAILURE"
      case "ACTION_REQUIRED":
        return "PENDING"
      case "SUCCESS":
        hasSuccess = true
        break
      // SKIPPED, CANCELLED, NEUTRAL, STALE are ignored
    }
  }

  return hasSuccess ? "SUCCESS" : "NONE"
}

/**
 * Application state
 */
export interface AppState {
  view: View
  prs: PR[]
  selectedIndex: number
  loading: boolean
  error: string | null
  /** Discovery bar visibility */
  discoveryVisible: boolean
  /** Current discovery query */
  discoveryQuery: string
  /** Temporary message to show (e.g., "Starred @user") */
  message: string | null
}
