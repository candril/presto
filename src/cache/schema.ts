/**
 * Cache schema for stale-while-revalidate PR data
 */

import type { PR, ColumnVisibility } from "../types"

export interface PRCache {
  /** Cached PRs */
  prs: PR[]
  /** When the cache was last updated */
  updatedAt: string // ISO date
  /** Which repos this cache is for (sorted, for comparison) */
  repos: string[]
  /** Last active filter query */
  filterQuery?: string
  /** Column visibility settings */
  columnVisibility?: ColumnVisibility
}

/** Default column visibility - all columns visible */
export const defaultColumnVisibility: ColumnVisibility = {
  state: true,
  checks: true,
  review: true,
  comments: true,
  time: true,
  repo: true,
  author: true,
}

export const defaultCache: PRCache = {
  prs: [],
  updatedAt: "",
  repos: [],
  filterQuery: "",
  columnVisibility: defaultColumnVisibility,
}

/** Cache is considered stale after this many minutes */
export const CACHE_STALE_MINUTES = 5
