/**
 * History schema for tracking starred authors, recent views, etc.
 */

export interface History {
  /** Authors the user has starred */
  starredAuthors: string[]

  /** Recently seen authors (from viewing their PRs) */
  recentAuthors: RecentAuthor[]

  /** Recently viewed PRs */
  recentlyViewed: RecentPR[]

  /** Recently used filter queries */
  recentFilters: string[]

  /** Marked/pinned PRs, keyed by "owner/repo#number" */
  markedPRs: string[]

  /** Snapshots of tracked PR states for change detection */
  prSnapshots: Record<string, PRSnapshot>

  /** Repositories visited via PR opens (not in config) */
  visitedRepos: VisitedRepo[]
}

/** A visited repository (not in config) */
export interface VisitedRepo {
  /** Full repo name: "owner/repo" */
  name: string
  /** When first visited */
  firstVisit: string // ISO date
  /** When last visited */
  lastVisit: string // ISO date
  /** Number of PR opens from this repo */
  visitCount: number
}

/** Types of changes that can be detected */
export type ChangeType =
  | "new_comments"
  | "approved"
  | "changes_requested"
  | "merged"
  | "closed"
  | "reopened"
  | "ready"
  | "draft"
  | "ci_passed"
  | "ci_failed"
  | "review_requested"
  | "manual" // Manually marked as unread

/** A single detected change */
export interface DetectedChange {
  type: ChangeType
  message: string
}

/** Combined PR state: draft, ready, merged, closed */
export type PRState = "draft" | "ready" | "merged" | "closed"

/** Snapshot of a PR's state for change detection */
export interface PRSnapshot {
  /** Combined PR state */
  prState: PRState
  /** Review decision: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, null */
  reviewDecision: string | null
  /** CI status: SUCCESS, FAILURE, PENDING, NONE */
  checkState: string
  /** Total comment count */
  commentCount: number
  /** When this snapshot was taken */
  snapshotAt: string // ISO date
  /** When user last "saw" this PR (selected or opened) */
  seenAt: string // ISO date
  /** Whether there are unseen changes */
  hasChanges: boolean
  /** List of detected changes (if hasChanges is true) */
  changes?: DetectedChange[]
  /** @deprecated use prState instead */
  state?: string
  /** @deprecated - use changes array instead */
  changeType?: ChangeType
  /** @deprecated - use changes array instead */
  changeMessage?: string
}

export interface RecentAuthor {
  login: string
  lastSeen: string // ISO date
  viewCount: number
}

export interface RecentPR {
  repo: string // "owner/repo"
  number: number
  title: string
  author: string
  viewedAt: string // ISO date
}

export const defaultHistory: History = {
  starredAuthors: [],
  recentAuthors: [],
  recentlyViewed: [],
  recentFilters: [],
  markedPRs: [],
  prSnapshots: {},
  visitedRepos: [],
}

/** Maximum items to keep in history */
export const HISTORY_LIMITS = {
  recentAuthors: 20,
  recentlyViewed: 30,
  recentFilters: 10,
  visitedRepos: 50,
}
