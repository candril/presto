/**
 * Change detection logic
 */

import type { History } from "../history/schema"
import type { PR } from "../types"
import { getRepoName, computeCheckState } from "../types"
import type { PRChange } from "./types"
import { getPRKey, computePRState } from "./snapshots"

/**
 * Detect changes in PRs compared to their snapshots
 */
export function detectChanges(
  prs: PR[],
  history: History,
  currentUser: string | null
): PRChange[] {
  const changes: PRChange[] = []

  // Build set of tracked PR keys
  const trackedKeys = new Set([
    ...(history.markedPRs ?? []),
    ...(history.recentlyViewed ?? []).map((r) => `${r.repo}#${r.number}`),
  ])

  for (const pr of prs) {
    const prKey = getPRKey(pr)
    const isMine = currentUser && pr.author.login === currentUser
    const isTracked = trackedKeys.has(prKey)

    // Only check my PRs + explicitly tracked PRs
    if (!isMine && !isTracked) continue

    const snapshot = history.prSnapshots?.[prKey]
    if (!snapshot) continue // First time seeing, no comparison

    // State changes (relevant for all tracked PRs)
    const currentState = computePRState(pr)
    const prevState = snapshot.prState ?? (snapshot.state === "MERGED" ? "merged" : snapshot.state === "CLOSED" ? "closed" : "ready")
    
    if (currentState !== prevState) {
      if (currentState === "merged") {
        changes.push({ prKey, pr, changeType: "merged", message: "was merged" })
      } else if (currentState === "closed") {
        changes.push({ prKey, pr, changeType: "closed", message: "was closed" })
      } else if (currentState === "ready" && prevState === "closed") {
        changes.push({ prKey, pr, changeType: "reopened", message: "was reopened" })
      } else if (currentState === "ready" && prevState === "draft") {
        changes.push({ prKey, pr, changeType: "ready", message: "marked ready for review" })
      } else if (currentState === "draft" && prevState === "ready") {
        changes.push({ prKey, pr, changeType: "draft", message: "converted to draft" })
      }
    }

    // Review changes (most relevant for my PRs)
    if (pr.reviewDecision !== snapshot.reviewDecision) {
      if (pr.reviewDecision === "APPROVED") {
        changes.push({
          prKey,
          pr,
          changeType: "approved",
          message: "was approved",
        })
      } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
        changes.push({
          prKey,
          pr,
          changeType: "changes_requested",
          message: "changes requested",
        })
      }
    }

    // CI changes (most relevant for my PRs)
    const checkState = computeCheckState(pr.statusCheckRollup)
    if (checkState !== snapshot.checkState) {
      if (checkState === "SUCCESS" && snapshot.checkState !== "SUCCESS") {
        changes.push({
          prKey,
          pr,
          changeType: "ci_passed",
          message: "CI passed",
        })
      } else if (checkState === "FAILURE" && snapshot.checkState !== "FAILURE") {
        changes.push({
          prKey,
          pr,
          changeType: "ci_failed",
          message: "CI failed",
        })
      }
    }

    // New comments (for all tracked PRs - you want to know when someone comments on PRs you're watching)
    if (pr.commentCount > snapshot.commentCount) {
      const newCount = pr.commentCount - snapshot.commentCount
      changes.push({
        prKey,
        pr,
        changeType: "new_comments",
        message: `${newCount} new comment${newCount > 1 ? "s" : ""}`,
      })
    }
  }

  return changes
}
