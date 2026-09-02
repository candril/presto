/**
 * Type definitions for presto
 */

// View modes for the application
export type View = "list"

// Preview panel position
export type PreviewPosition = "right" | "bottom" | null

// Column visibility settings
export type ColumnId = "state" | "checks" | "review" | "sync" | "merge" | "comments" | "time" | "repo" | "author"

export interface ColumnVisibility {
  state: boolean
  checks: boolean
  review: boolean
  sync: boolean
  merge: boolean
  comments: boolean
  time: boolean
  repo: boolean
  author: boolean
}

/**
 * Pull Request from GitHub API
 */
export interface PR {
  number: number
  title: string
  author: {
    login: string
    name?: string | null
  }
  /** Full URL of the PR */
  url: string
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  createdAt: string
  updatedAt: string
  reviewDecision: ReviewDecision | null
  statusCheckRollup: StatusCheckRollup | null
  /** Total human comments: PR-level, review bodies, and review-thread comments */
  commentCount: number
  /**
   * Comments inside unresolved review threads — what is still waiting on someone. The
   * rest of `commentCount` is conversation and review bodies, which GitHub gives no way
   * to resolve, so counting those as open would just restate the total.
   */
  openCommentCount: number
  /** HEAD commit SHA (for detecting new pushes) */
  headRefOid: string | null
  /** When the head commit landed — used to tell a slow CI start from one that never came */
  headCommittedAt: string | null
  /**
   * No check run has started for the head commit, but suites are sitting queued.
   * `statusCheckRollup` counts only started runs, so without this a pipeline that CI has
   * not picked up is indistinguishable from a repo with no CI at all.
   */
  checksQueued: boolean
  /**
   * Open review threads. This team blocks by commenting rather than by requesting
   * changes, so an unresolved thread is the author's cue even though GitHub still reports
   * the PR as merely awaiting review.
   */
  unresolvedThreads: number
  /**
   * Humans whose latest approve/request-changes review is an approval. GitHub's
   * `reviewDecision` can be null while approvals stand (seen live on a non-draft PR with
   * two of them), and "no review yet" would be a lie there — this is the receipts.
   */
  approvedBy: string[]
  /** Head branch name (for branch search) */
  headRefName: string | null
  /** GitHub's computed merge state; UNKNOWN while GitHub is still computing it */
  mergeStateStatus: MergeStateStatus | null
  /** Merge method auto-merge is armed with, or null when auto-merge is off */
  autoMergeMethod: MergeMethod | null
  /** Base branch this PR targets */
  baseRefName: string | null
  /**
   * How the head branch sits relative to base. Independent of `mergeStateStatus`, which
   * collapses BEHIND under BLOCKED whenever both apply.
   */
  baseSync: BaseSync
  /** Whether being behind actually blocks the merge (base branch requires up-to-date) */
  baseUpdateRequired: boolean
}

/** How a PR's head branch relates to its base branch (GitHub `mergeStateStatus`) */
export type MergeStateStatus =
  | "BEHIND"
  | "BLOCKED"
  | "CLEAN"
  | "DIRTY"
  | "DRAFT"
  | "HAS_HOOKS"
  | "UNKNOWN"
  | "UNSTABLE"

/**
 * Where a PR's head branch stands against its base.
 *
 * "unknown" is a real answer, not a placeholder: `viewerCanUpdateBranch` is false both
 * for a branch that is current and for one the viewer merely cannot push to, and the
 * `gh pr list` fallback cannot distinguish current from behind-but-not-blocking at all.
 */
export type BaseSync = "behind" | "up-to-date" | "unknown"

/** Merge strategies GitHub offers, shared by merge and auto-merge */
export type MergeMethod = "merge" | "squash" | "rebase"

/**
 * Backfill fields a serialized PR predates. The on-disk cache stores whole PR objects,
 * so every field added to this interface is missing from PRs cached before it existed —
 * `approvedBy.length` on such a PR crashed the list at render. New fields get their
 * absent-data default here, once, instead of defensive checks at every use site.
 */
export function normalizePR(raw: Partial<PR> & Pick<PR, "number" | "title" | "url">): PR {
  return {
    author: { login: "unknown" },
    state: "OPEN",
    isDraft: false,
    createdAt: "",
    updatedAt: "",
    reviewDecision: null,
    statusCheckRollup: null,
    commentCount: 0,
    openCommentCount: 0,
    headRefOid: null,
    headRefName: null,
    mergeStateStatus: null,
    autoMergeMethod: null,
    baseRefName: null,
    baseSync: "unknown",
    baseUpdateRequired: false,
    headCommittedAt: null,
    checksQueued: false,
    unresolvedThreads: 0,
    approvedBy: [],
    ...raw,
  }
}

/** GitHub reports the auto-merge method as an upper-case enum (MERGE/SQUASH/REBASE) */
export function toMergeMethod(raw: unknown): MergeMethod | null {
  switch (raw) {
    case "MERGE":
      return "merge"
    case "SQUASH":
      return "squash"
    case "REBASE":
      return "rebase"
    default:
      return null
  }
}

/**
 * The single answer to "who is holding this up?".
 *
 * Deliberately not blocked/pending/ready: measured across the configured repos, that
 * split put 86% of open PRs in "blocked", making the column a constant. Sorting by whose
 * move it is spreads the same PRs across buckets that each imply a different next step.
 */
export type MergeVerdict =
  | "pending-action"
  | "auto-merge"
  | "ready"
  | "author"
  | "others"
  | "machine"
  | "draft"

export function computeMergeVerdict(pr: PR, hasPendingAction: boolean): MergeVerdict {
  return computeMergeVerdictDetail(pr, hasPendingAction).verdict
}

/**
 * The verdict plus the specific rule that produced it, for surfaces with room to explain
 * (the preview panel). One code path for both, so the explanation can never disagree
 * with the glyph.
 */
export function computeMergeVerdictDetail(
  pr: PR,
  hasPendingAction: boolean
): { verdict: MergeVerdict; reason: string } {
  if (hasPendingAction) return { verdict: "pending-action", reason: "your branch update is still landing" }

  // A draft is not up for merge, so it has no merge verdict — the state column already
  // says it is a draft, and repeating that here would drown the column: drafts are 52% of
  // open PRs, 57 of 65 with nobody asked and nobody looking, median age 127 days.
  //
  // Nothing GitHub reports about a draft is trustworthy enough to build a verdict on
  // either: branch protection is not evaluated for drafts, so one draft answers CLEAN
  // with a null review decision while its base in fact requires an approval, and another
  // answers BLOCKED with REVIEW_REQUIRED that no one actually requested.
  if (pr.isDraft) return { verdict: "draft", reason: "draft — not up for merge yet" }

  if (pr.autoMergeMethod) {
    return { verdict: "auto-merge", reason: `auto-merge (${pr.autoMergeMethod}) armed — lands when ready` }
  }

  // Before any merge-state reading: this team blocks with plain comments instead of
  // "request changes", so GitHub reports REVIEW_REQUIRED (or even CLEAN) on a PR whose
  // reviewer is in fact waiting on the author. An open thread is the author's move, and
  // only once every thread is resolved does an unapproved PR go back to awaiting review.
  if (pr.unresolvedThreads > 0) {
    const threads = pr.unresolvedThreads === 1 ? "1 open comment thread" : `${pr.unresolvedThreads} open comment threads`
    return { verdict: "author", reason: `${threads} to resolve` }
  }

  if (pr.mergeStateStatus === "CLEAN" || pr.mergeStateStatus === "HAS_HOOKS") {
    return { verdict: "ready", reason: "can be merged now" }
  }
  // UNSTABLE is mergeable too: only a non-required check is red, and GitHub offers the
  // merge. The checks column carries the warning.
  if (pr.mergeStateStatus === "UNSTABLE") {
    return { verdict: "ready", reason: "mergeable — a non-required check is red" }
  }

  const rollupState = computeCheckState(pr.statusCheckRollup)
  const checks = getPRCheckState(pr)

  // The author's move: everything only they can clear. A red build belongs here — it was
  // previously falling through to "waiting on others", which reads as "needs a review".
  if (pr.mergeStateStatus === "DIRTY") return { verdict: "author", reason: "conflicts with base to resolve" }
  if (pr.mergeStateStatus === "BEHIND") return { verdict: "author", reason: "base branch must be merged in" }
  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return { verdict: "author", reason: "a reviewer requested changes" }
  }
  if (checks === "FAILURE") return { verdict: "author", reason: "failing checks to fix" }
  if (checksAreStalled(pr, rollupState)) {
    return { verdict: "author", reason: "checks never started — re-trigger CI" }
  }

  // An outstanding review outranks running CI: the review is the bottleneck a human can
  // clear now, and CI finishes on its own either way.
  if (pr.reviewDecision === "REVIEW_REQUIRED") return { verdict: "others", reason: "waiting for a review" }

  // Nothing is outstanding from any human — CI is running, has not reported yet, or
  // GitHub is still computing the merge state. NONE lands here rather than in the
  // residual bucket because a blocked PR with no checks reported is waiting on required
  // checks to appear, not on a person.
  if (checks === "PENDING") {
    return {
      verdict: "machine",
      reason: rollupState === "NONE" ? "waiting for checks to start" : "waiting for checks to finish",
    }
  }
  if (checks === "NONE" || pr.mergeStateStatus === "UNKNOWN") {
    return { verdict: "machine", reason: "waiting for GitHub" }
  }

  // Residual: blocked, reviewed, green. Something unnamed gates it (required deployment,
  // unresolved conversation, a CODEOWNER). Still someone else's move, just not a named one.
  return { verdict: "others", reason: "blocked by branch protection" }
}

/**
 * What the checks column should show. The rollup counts only started runs, so a commit
 * whose suites are all still QUEUED reports NONE — which reads as "this repo has no CI"
 * when the truth is "CI has not picked it up yet".
 */
export function getPRCheckState(pr: PR): CheckState {
  const rollup = computeCheckState(pr.statusCheckRollup)
  if (rollup === "NONE" && pr.checksQueued) return "PENDING"
  return rollup
}

/**
 * How long to let a blocked PR report no checks before treating them as never coming.
 * CI normally reports within a minute or two; this is deliberately generous so a slow
 * pipeline start is not mistaken for a stall.
 */
export const STALE_CHECKS_MS = 30 * 60 * 1000

/**
 * A required check that has not reported long after the commit landed is not "running" —
 * it is stuck, and waiting on it is futile. Guarded on BLOCKED so repos with no CI at all
 * (where nothing is gating the merge) never trip it.
 */
function checksAreStalled(pr: PR, rollupState: CheckState): boolean {
  // Deliberately keyed on the raw rollup: "queued but nothing started" is exactly the
  // stuck case, so it must not be excused by the display state being PENDING.
  if (rollupState !== "NONE" || pr.mergeStateStatus !== "BLOCKED") return false
  if (!pr.headCommittedAt) return false
  const committedAt = new Date(pr.headCommittedAt).getTime()
  if (Number.isNaN(committedAt)) return false
  return Date.now() - committedAt > STALE_CHECKS_MS
}

/** An action the user fired that GitHub has not finished applying yet */
export interface PendingAction {
  kind: PendingActionKind
  /** Epoch millis, for the TTL that stops a failed action pinning the marker forever */
  firedAt: number
}

/**
 * Only branch updates need this. Merging and arming auto-merge already update the row
 * optimistically and land immediately, so a marker there would only add flicker.
 */
export type PendingActionKind = "update-branch"

/** A pending marker outlives its usefulness fast — drop it even if nothing confirmed it */
export const PENDING_ACTION_TTL_MS = 2 * 60 * 1000

/**
 * Whether a refreshed PR shows the fired action actually landed. Each kind watches the
 * one field GitHub changes when it is done.
 */
export function isPendingActionSettled(pending: PendingAction, before: PR, after: PR): boolean {
  switch (pending.kind) {
    case "update-branch":
      return before.headRefOid !== after.headRefOid
  }
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
  /** Repository name (owner/repo) */
  repo: string

  /** PR number */
  number: number

  /** PR title */
  title: string

  /** PR state */
  state: "OPEN" | "CLOSED" | "MERGED"

  /** Is draft PR */
  isDraft: boolean

  /** Files changed with line counts */
  files: ChangedFile[]

  /** Total additions across all files */
  additions: number

  /** Total deletions across all files */
  deletions: number

  /** Commits in the PR */
  commits: PRCommit[]

  /** Author details */
  author: {
    login: string
    createdAt: string // ISO date
  }

  /** Review status per reviewer */
  reviews: PRReview[]

  /** Requested reviewers (not yet reviewed) */
  requestedReviewers: string[]

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

  /** Recent comments for display in preview */
  recentComments: PreviewComment[]
}

/** A comment for preview display */
export interface PreviewComment {
  /** Comment author login */
  author: string
  /** Full comment body (will be truncated in UI) */
  body: string
  /** ISO date when comment was created */
  createdAt: string
  /** Whether this is a review comment (vs PR-level) */
  isReviewComment: boolean
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

// Tab types (re-exported from tabs module)
import type { Tab } from "./tabs/types"
export type { Tab }

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
  /** Last successful refresh timestamp */
  lastRefresh: Date | null
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

  // Column visibility
  /** Which columns are visible in the PR list */
  columnVisibility: ColumnVisibility

  // Tab state (spec 011)
  /** All tabs */
  tabs: Tab[]
  /** Currently active tab ID */
  activeTabId: string
  /** Last closed tab for undo */
  closedTab: { tab: Tab; index: number } | null

  // In-flight action markers (spec 036)
  /** Actions the user fired that GitHub has not finished applying, keyed by PR key */
  pendingActions: Record<string, PendingAction>

  // Gate detail (spec 037)
  /** Whether the gate columns are expanded; the merge verdict alone shows when false */
  gateDetail: boolean

  // Mark categories (spec 028)
  /** Waiting for a letter after pressing M (Shift+M) */
  markPending: boolean
  /** Waiting for a letter after pressing ' (quote) */
  jumpPending: boolean
}
