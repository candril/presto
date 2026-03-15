/**
 * Notification types
 */

import type { PR } from "../types"
import type { ChangeType } from "../history/schema"

// Re-export ChangeType for convenience
export type { ChangeType }

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
