export {
  loadHistory,
  saveHistory,
  toggleStarAuthor,
  isAuthorStarred,
  recordAuthorView,
  recordPRView,
  recordFilterQuery,
} from "./loader"

export {
  defaultHistory,
  HISTORY_LIMITS,
  type History,
  type RecentAuthor,
  type RecentPR,
} from "./schema"
