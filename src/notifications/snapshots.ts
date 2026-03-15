/**
 * PR snapshot management for change detection
 */

import type { History, PRSnapshot, ChangeType, DetectedChange, PRState } from "../history/schema"
import type { PR } from "../types"
import { getRepoName, computeCheckState } from "../types"

/** Compute combined PR state from PR fields */
export function computePRState(pr: PR): PRState {
  if (pr.state === "MERGED") return "merged"
  if (pr.state === "CLOSED") return "closed"
  if (pr.isDraft) return "draft"
  return "ready"
}

/** Get PR key from PR object */
export function getPRKey(pr: PR): string
export function getPRKey(repo: string, number: number): string
export function getPRKey(prOrRepo: PR | string, number?: number): string {
  if (typeof prOrRepo === "string") {
    return `${prOrRepo}#${number}`
  }
  return `${getRepoName(prOrRepo)}#${prOrRepo.number}`
}

/** Create a snapshot from a PR */
export function createSnapshot(pr: PR): PRSnapshot {
  const now = new Date().toISOString()
  return {
    prState: computePRState(pr),
    reviewDecision: pr.reviewDecision,
    checkState: computeCheckState(pr.statusCheckRollup),
    commentCount: pr.commentCount,
    snapshotAt: now,
    seenAt: now,
    hasChanges: false,
  }
}

/** Update snapshot for a PR (track current state) */
export function updateSnapshot(history: History, pr: PR): History {
  const prKey = getPRKey(pr)
  const existing = history.prSnapshots[prKey]
  const now = new Date().toISOString()
  const checkState = computeCheckState(pr.statusCheckRollup)

  return {
    ...history,
    prSnapshots: {
      ...history.prSnapshots,
      [prKey]: {
        prState: computePRState(pr),
        reviewDecision: pr.reviewDecision,
        checkState,
        commentCount: pr.commentCount,
        snapshotAt: now,
        // Keep existing seenAt, hasChanges, and change info if we have them
        seenAt: existing?.seenAt ?? now,
        hasChanges: existing?.hasChanges ?? false,
        changes: existing?.changes,
      },
    },
  }
}

/** Mark a PR as having unseen changes */
export function markPRHasChanges(
  history: History,
  prKey: string,
  changes: DetectedChange[]
): History {
  const snapshot = history.prSnapshots[prKey]
  if (!snapshot) return history

  // Merge with existing changes (avoid duplicates by type)
  const existingChanges = snapshot.changes ?? []
  const existingTypes = new Set(existingChanges.map((c) => c.type))
  const newChanges = changes.filter((c) => !existingTypes.has(c.type))
  const mergedChanges = [...existingChanges, ...newChanges]

  return {
    ...history,
    prSnapshots: {
      ...history.prSnapshots,
      [prKey]: {
        ...snapshot,
        hasChanges: true,
        changes: mergedChanges,
      },
    },
  }
}

/** Mark a PR as seen (clear hasChanges and change info) */
export function markPRSeen(history: History, prKey: string): History {
  const snapshot = history.prSnapshots[prKey]
  if (!snapshot) return history

  return {
    ...history,
    prSnapshots: {
      ...history.prSnapshots,
      [prKey]: {
        ...snapshot,
        seenAt: new Date().toISOString(),
        hasChanges: false,
        changes: undefined,
      },
    },
  }
}

/** Check if a PR has unseen changes */
export function prHasChanges(history: History, prKey: string): boolean {
  return history.prSnapshots[prKey]?.hasChanges ?? false
}

/** Update snapshots for all tracked PRs */
export function updateAllSnapshots(
  history: History,
  prs: PR[],
  currentUser: string | null
): History {
  let updated = history

  // Build set of tracked PR keys
  const trackedKeys = new Set([
    ...(history.markedPRs ?? []),
    ...(history.recentlyViewed ?? []).map((r) => `${r.repo}#${r.number}`),
  ])

  for (const pr of prs) {
    const prKey = getPRKey(pr)
    const isMine = currentUser && pr.author.login === currentUser
    const isTracked = trackedKeys.has(prKey)

    // Only track my PRs + explicitly tracked PRs
    if (isMine || isTracked) {
      updated = updateSnapshot(updated, pr)
    }
  }

  return updated
}
