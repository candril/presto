export {
  loadHistory,
  saveHistory,
  debouncedSaveHistory,
  toggleStarAuthor,
  isAuthorStarred,
  recordAuthorView,
  recordPRView,
  recordFilterQuery,
  // PR marking (spec 015 + 028 letter-based categories)
  getPRKey,
  toggleMarkPR,
  isPRMarked,
  getPRMark,
  getPRsWithMark,
  getUsedMarkLetters,
  getMarkedPRCount,
  getAllMarkedPRKeys,
  migrateMarkedPRs,
  isPRRecent,
  getPRRecencyLevel,
  clearAllMarks,
  clearRecentPRs,
  removePRFromRecent,
  type RecencyLevel,
  // Visited repos (spec 018)
  recordRepoVisit,
  forgetRepo,
  isRepoVisited,
} from "./loader"

export {
  defaultHistory,
  HISTORY_LIMITS,
  type History,
  type RecentAuthor,
  type RecentPR,
  type VisitedRepo,
} from "./schema"
