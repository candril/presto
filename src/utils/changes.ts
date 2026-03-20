/**
 * Change type display utilities
 * Shared icons and colors for PR change types (notifications, preview panel)
 */

import type { ChangeType } from "../history/schema"
import { theme } from "../theme"

/** Get icon for a change type */
export function getChangeIcon(type: ChangeType): string {
  switch (type) {
    case "merged":
      return "◆"
    case "closed":
      return "✕"
    case "reopened":
      return "○"
    case "ready":
      return "►"
    case "draft":
      return "◌"
    case "approved":
      return "✓"
    case "changes_requested":
      return "!"
    case "ci_passed":
      return "✓"
    case "ci_failed":
      return "✗"
    case "review_requested":
      return "→"
    case "new_comments":
      return "◇"
    case "new_push":
      return "↑"
    case "manual":
      return "●"
  }
}

/** Get theme color for a change type */
export function getChangeColor(type: ChangeType): string {
  switch (type) {
    case "merged":
      return theme.prMerged
    case "closed":
      return theme.textDim
    case "reopened":
      return theme.success
    case "ready":
      return theme.success
    case "draft":
      return theme.textMuted
    case "approved":
      return theme.success
    case "changes_requested":
      return theme.warning
    case "ci_passed":
      return theme.success
    case "ci_failed":
      return theme.error
    case "review_requested":
      return theme.primary
    case "new_comments":
      return theme.primary
    case "new_push":
      return theme.primary
    case "manual":
      return theme.warning
  }
}
