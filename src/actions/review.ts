/**
 * Submit a pull request review (approve / request changes / comment).
 */

import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName } from "../types"

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

export interface SubmitReviewResult {
  success: boolean
  message: string
}

/**
 * Submit a review on a PR via `gh api`.
 *
 * `commit_id` is intentionally omitted from the payload — GitHub defaults to
 * the latest commit on the PR, which is what the user is looking at.
 */
export async function submitPRReview(
  pr: PR,
  event: ReviewEvent,
  body: string
): Promise<SubmitReviewResult> {
  const repo = getRepoName(pr)
  const payload = JSON.stringify({ event, body })

  try {
    await $`echo ${payload} | gh api repos/${repo}/pulls/${pr.number}/reviews --method POST --input -`.quiet()
    const label =
      event === "APPROVE"
        ? "Approved"
        : event === "REQUEST_CHANGES"
          ? "Requested changes on"
          : "Commented on"
    return { success: true, message: `${label} #${pr.number}` }
  } catch (e: any) {
    // gh surfaces API errors (e.g. "Can not approve your own pull request") on stderr
    const stderr =
      e?.stderr?.toString?.()?.trim() ||
      e?.message ||
      "Submit review failed"
    return { success: false, message: stderr }
  }
}
