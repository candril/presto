/**
 * Cache schema for stale-while-revalidate PR data
 */

import type { PR } from "../types"

export interface PRCache {
  /** Cached PRs */
  prs: PR[]
  /** When the cache was last updated */
  updatedAt: string // ISO date
  /** Which repos this cache is for (sorted, for comparison) */
  repos: string[]
  /** Last active filter query */
  filterQuery?: string
}

export const defaultCache: PRCache = {
  prs: [],
  updatedAt: "",
  repos: [],
  filterQuery: "",
}

/** Cache is considered stale after this many minutes */
export const CACHE_STALE_MINUTES = 5
