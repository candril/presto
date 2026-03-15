/**
 * Notification types
 */

import type { PR } from "../types"
import type { ChangeType, DetectedChange } from "../history/schema"

// Re-export types for convenience
export type { ChangeType, DetectedChange }

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
