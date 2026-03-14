/**
 * History schema for tracking starred authors, recent views, etc.
 */

export interface History {
  /** Authors the user has starred */
  starredAuthors: string[]

  /** Recently seen authors (from viewing their PRs) */
  recentAuthors: RecentAuthor[]

  /** Recently viewed PRs */
  recentlyViewed: RecentPR[]

  /** Recently used filter queries */
  recentFilters: string[]

  /** Marked/pinned PRs, keyed by "owner/repo#number" */
  markedPRs: string[]
}

export interface RecentAuthor {
  login: string
  lastSeen: string // ISO date
  viewCount: number
}

export interface RecentPR {
  repo: string // "owner/repo"
  number: number
  title: string
  author: string
  viewedAt: string // ISO date
}

export const defaultHistory: History = {
  starredAuthors: [],
  recentAuthors: [],
  recentlyViewed: [],
  recentFilters: [],
  markedPRs: [],
}

/** Maximum items to keep in history */
export const HISTORY_LIMITS = {
  recentAuthors: 20,
  recentlyViewed: 30,
  recentFilters: 10,
}
