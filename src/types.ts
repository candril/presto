/**
 * Type definitions for presto
 */

// View modes for the application
export type View = "list" | "detail"

// Preview panel position
export type PreviewPosition = "right" | "bottom" | null

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

// ============================================================================
// PR Preview Types (spec 014)
// ============================================================================

/** Full preview data for a PR */
export interface PRPreview {
  /** Files changed with line counts */
  files: ChangedFile[]

  /** Commits in the PR */
  commits: PRCommit[]

  /** Author details */
  author: {
    login: string
    createdAt: string // ISO date
  }

  /** Review status per reviewer */
  reviews: PRReview[]

  /** CI/check status */
  checks: PreviewCheckStatus

  /** PR description body */
  body: string

  /** Branch info */
  baseRef: string
  headRef: string

  /** Merge state */
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN"

  /** Comment counts */
  commentCount: number
  reviewCommentCount: number
}

export interface ChangedFile {
  path: string
  additions: number
  deletions: number
  status: "added" | "modified" | "deleted" | "renamed"
}

export interface PRCommit {
  oid: string // Short SHA
  message: string // First line only
  author: string
  committedAt: string
}

export interface PRReview {
  author: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING"
  submittedAt: string
}

export interface PreviewCheckStatus {
  overall: "success" | "failure" | "pending" | "neutral"
  checks: PreviewCheck[]
}

export interface PreviewCheck {
  name: string
  status: "success" | "failure" | "pending" | "neutral"
}

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
  /** Initial loading (shows full screen spinner) */
  loading: boolean
  /** Background refresh (shows ↻ in header) */
  refreshing: boolean
  error: string | null
  /** Discovery bar visibility */
  discoveryVisible: boolean
  /** Current discovery query */
  discoveryQuery: string
  /** Temporary message to show (e.g., "Starred @user") */
  message: string | null

  // Preview state (spec 014)
  /** Preview panel position: null = off, 'right' = side panel, 'bottom' = bottom panel */
  previewPosition: PreviewPosition
  /** Cache of loaded previews, keyed by "owner/repo#number" */
  previewCache: Map<string, PRPreview>
  /** Currently loading preview for this PR key */
  previewLoading: string | null
  /** Scroll offset for preview panel */
  previewScrollOffset: number

  // Command palette state (spec 010)
  /** Command palette visibility */
  commandPaletteVisible: boolean
}
