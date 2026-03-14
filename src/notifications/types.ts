/**
 * Notification types
 */

import type { PR } from "../types"

/** Types of changes we can detect */
export type ChangeType =
  | "merged"
  | "closed"
  | "approved"
  | "changes_requested"
  | "ci_passed"
  | "ci_failed"
  | "review_requested"
  | "new_comments"

/** A detected change in a PR */
export interface PRChange {
  /** PR key: "owner/repo#123" */
  prKey: string
  /** The PR with updated state */
  pr: PR
  /** Type of change detected */
  changeType: ChangeType
  /** Human-readable message */
  message: string
}
