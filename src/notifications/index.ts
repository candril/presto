/**
 * Notifications module - exports
 */

export type { PRChange, ChangeType } from "./types"
export { detectChanges } from "./detector"
export {
  getPRKey,
  createSnapshot,
  updateSnapshot,
  markPRHasChanges,
  markPRSeen,
  prHasChanges,
  updateAllSnapshots,
} from "./snapshots"
export {
  sendDesktopNotification,
  formatChangesForDesktop,
  type DesktopNotification,
} from "./desktop"
