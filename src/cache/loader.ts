/**
 * Cache persistence - load and save PR cache for instant startup
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getConfigDir } from "../config"
import type { PR, ColumnVisibility } from "../types"
import { defaultCache, defaultColumnVisibility, CACHE_STALE_MINUTES, type PRCache } from "./schema"

/** Cache file path */
const CACHE_FILE = join(getConfigDir(), "cache.json")

/** Load cached PRs from disk */
export function loadCache(): PRCache {
  if (!existsSync(CACHE_FILE)) {
    return { ...defaultCache }
  }

  try {
    const content = readFileSync(CACHE_FILE, "utf-8")
    return { ...defaultCache, ...JSON.parse(content) }
  } catch {
    return { ...defaultCache }
  }
}

/** Save PRs and filter to cache */
export function saveCache(prs: PR[], repos: string[], filterQuery?: string): void {
  const cache: PRCache = {
    prs,
    updatedAt: new Date().toISOString(),
    repos: [...repos].sort(),
    filterQuery: filterQuery || "",
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache))
}

/** Save just the filter query (without updating PRs) */
export function saveFilterQuery(filterQuery: string): void {
  const cache = loadCache()
  cache.filterQuery = filterQuery
  writeFileSync(CACHE_FILE, JSON.stringify(cache))
}

/** Save column visibility settings */
export function saveColumnVisibility(columnVisibility: ColumnVisibility): void {
  const cache = loadCache()
  cache.columnVisibility = columnVisibility
  writeFileSync(CACHE_FILE, JSON.stringify(cache))
}

/** Get column visibility from cache (with defaults) */
export function getColumnVisibility(): ColumnVisibility {
  const cache = loadCache()
  return { ...defaultColumnVisibility, ...cache.columnVisibility }
}

/** Check if cache is valid for these repos */
export function isCacheValidForRepos(cache: PRCache, repos: string[]): boolean {
  if (cache.prs.length === 0) return false
  const sortedRepos = [...repos].sort()
  return JSON.stringify(cache.repos) === JSON.stringify(sortedRepos)
}

/** Check if cache is stale (older than threshold) */
export function isCacheStale(cache: PRCache): boolean {
  if (!cache.updatedAt) return true
  const cacheAge = Date.now() - new Date(cache.updatedAt).getTime()
  return cacheAge > CACHE_STALE_MINUTES * 60 * 1000
}

/** Get cache age in human-readable format */
export function getCacheAge(cache: PRCache): string {
  if (!cache.updatedAt) return "never"
  const ageMs = Date.now() - new Date(cache.updatedAt).getTime()
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
