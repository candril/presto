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
