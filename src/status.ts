/**
 * The status-column vocabulary — glyphs, colours, and spelled-out meanings.
 *
 * One source for every surface that renders S/C/R/B/M (the list rows, the preview
 * header), so a glyph can never mean different things in different places.
 */

import { theme } from "./theme"
import type { CheckState, MergeQueueEntry, MergeVerdict, PR } from "./types"
import { computeMergeVerdictDetail } from "./types"

export interface StatusIndicator {
  icon: string
  color: string
}

/** Unicode icons */
export const ICONS = {
  // PR state icons
  prOpen: "○",      // open circle
  prDraft: "◌",     // dotted circle
  prMerged: "●",    // filled circle
  prClosed: "✗",    // x mark
  // CI check icons
  checkSuccess: "✓", // check mark
  checkFailure: "✗", // x mark
  checkPending: "*", // asterisk for pending
  checkNone: "-",    // dash
  // Review icons
  reviewApproved: "✓", // check mark
  reviewChanges: "!",  // exclamation
  reviewRequired: "?", // question mark
  reviewNone: "-",     // dash
  // Base branch sync icons
  syncBehind: "↓",     // base has moved on
  syncCurrent: "✓",    // up to date with base
  syncUnknown: "-",    // genuinely cannot tell (fork PR, or the gh fallback path)
  // Merge verdict icons — whose move is it
  mergeReady: "✓",     // nobody's: merge it
  mergeAuthor: "!",    // the author's: behind, conflicts, draft, changes requested
  mergeOthers: "?",    // someone else's: usually a review, sometimes another gate
  mergeMachine: "·",   // a machine's: CI running, GitHub still computing
  mergeAuto: "⇢",      // nobody's: auto-merge will land it by itself
  mergeQueued: "⧗",    // nobody's: in the merge queue, in line to land
  mergePending: "↻",   // an action the user fired has not landed yet
  mergeNone: "-",      // draft: not up for merge, so no verdict to give
}

/** Get state indicator for PR (Open/Draft/Merged/Closed) */
export function getStateIndicator(pr: PR): StatusIndicator {
  switch (pr.state) {
    case "MERGED":
      return { icon: ICONS.prMerged, color: theme.prMerged }
    case "CLOSED":
      return { icon: ICONS.prClosed, color: theme.prClosed }
    case "OPEN":
    default:
      if (pr.isDraft) {
        return { icon: ICONS.prDraft, color: theme.prDraft }
      }
      return { icon: ICONS.prOpen, color: theme.prOpen }
  }
}

/** Get CI check status indicator */
export function getCheckIndicator(state: CheckState): StatusIndicator {
  switch (state) {
    case "SUCCESS":
      return { icon: ICONS.checkSuccess, color: theme.success }
    case "FAILURE":
      return { icon: ICONS.checkFailure, color: theme.error }
    case "PENDING":
      return { icon: ICONS.checkPending, color: theme.warning }
    case "NONE":
    default:
      return { icon: ICONS.checkNone, color: theme.textMuted }
  }
}

/**
 * Get review status indicator.
 *
 * GitHub's `reviewDecision` can be null while approvals stand (observed on a non-draft
 * PR carrying two). A dash there would claim "no review yet", so standing approvals get
 * a dim tick — approved, but GitHub is not counting it as the decision.
 */
export function getReviewIndicator(pr: PR): StatusIndicator {
  switch (pr.reviewDecision) {
    case "APPROVED":
      return { icon: ICONS.reviewApproved, color: theme.success }
    case "CHANGES_REQUESTED":
      return { icon: ICONS.reviewChanges, color: theme.error }
    case "REVIEW_REQUIRED":
      return { icon: ICONS.reviewRequired, color: theme.warning }
    default:
      if (pr.approvedBy.length > 0) {
        return { icon: ICONS.reviewApproved, color: theme.textDim }
      }
      return { icon: ICONS.reviewNone, color: theme.textMuted }
  }
}

/**
 * Get base-branch sync indicator: is base ahead of this PR, and does that block it.
 *
 * Being current earns a tick rather than a dash. A dash means "no data" in the checks and
 * review columns, so using it for the *good* state here read as though something were
 * missing.
 *
 * Repos that don't require an up-to-date branch still get an arrow — pulling base in is
 * available, just not mandatory — dimmed so it doesn't read as something to fix.
 */
export function getSyncIndicator(pr: PR): StatusIndicator {
  switch (pr.baseSync) {
    case "behind":
      return {
        icon: ICONS.syncBehind,
        color: pr.baseUpdateRequired ? theme.warning : theme.textMuted,
      }
    case "up-to-date":
      return { icon: ICONS.syncCurrent, color: theme.success }
    case "unknown":
    default:
      return { icon: ICONS.syncUnknown, color: theme.textMuted }
  }
}

/**
 * Get the overall "who is holding this up?" indicator. A queued PR turns green once
 * GitHub calls it mergeable in the queue: from there it lands without anyone.
 */
export function getMergeIndicator(verdict: MergeVerdict, queue: MergeQueueEntry | null = null): StatusIndicator {
  switch (verdict) {
    case "pending-action":
      return { icon: ICONS.mergePending, color: theme.warning }
    case "queued":
      return { icon: ICONS.mergeQueued, color: queue?.state === "MERGEABLE" ? theme.success : theme.primary }
    case "auto-merge":
      return { icon: ICONS.mergeAuto, color: theme.secondary }
    case "ready":
      return { icon: ICONS.mergeReady, color: theme.success }
    case "author":
      return { icon: ICONS.mergeAuthor, color: theme.warning }
    case "others":
      return { icon: ICONS.mergeOthers, color: theme.primary }
    case "machine":
      return { icon: ICONS.mergeMachine, color: theme.textMuted }
    case "draft":
    default:
      return { icon: ICONS.mergeNone, color: theme.textMuted }
  }
}

/** The list's Merge column: the verdict glyph and its reason in a word or two */
export function getMergeLabel(pr: PR, hasPendingAction: boolean): StatusIndicator & { text: string } {
  const detail = computeMergeVerdictDetail(pr, hasPendingAction)
  return { ...getMergeIndicator(detail.verdict, pr.mergeQueue), text: detail.short }
}
