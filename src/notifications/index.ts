/**
 * Notifications module - exports
 */

export type { PRChange, ChangeType, DetectedChange } from "./types"
export { detectChanges } from "./detector"
export {
  getPRKey,
  createSnapshot,
  updateSnapshot,
  markPRHasChanges,
  markPRSeen,
  prHasChanges,
  updateAllSnapshots,
  computePRState,
} from "./snapshots"
export {
  sendDesktopNotification,
  formatChangesForDesktop,
  type DesktopNotification,
} from "./desktop"
