export {
  loadHistory,
  saveHistory,
  toggleStarAuthor,
  isAuthorStarred,
  recordAuthorView,
  recordPRView,
  recordFilterQuery,
  // PR marking (spec 015)
  getPRKey,
  toggleMarkPR,
  isPRMarked,
  isPRRecent,
  getPRRecencyLevel,
  clearAllMarks,
  clearRecentPRs,
  removePRFromRecent,
  type RecencyLevel,
} from "./loader"

export {
  defaultHistory,
  HISTORY_LIMITS,
  type History,
  type RecentAuthor,
  type RecentPR,
} from "./schema"
