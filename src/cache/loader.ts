/**
 * Cache persistence - load and save PR cache for instant startup
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getConfigDir } from "../config"
import type { PR, ColumnVisibility } from "../types"
import { normalizePR } from "../types"
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
    const cache = { ...defaultCache, ...JSON.parse(content) } as PRCache
    // Cached PRs may predate fields added to the PR interface since they were written
    cache.prs = (cache.prs ?? []).map(normalizePR)
    return cache
  } catch {
    return { ...defaultCache }
  }
}

/**
 * Write the cache atomically — a process killed mid-write would otherwise leave
 * truncated JSON behind, which loadCache can only recover from by discarding
 * everything.
 */
function writeCache(cache: PRCache): void {
  const tmpFile = `${CACHE_FILE}.tmp`
  writeFileSync(tmpFile, JSON.stringify(cache))
  renameSync(tmpFile, CACHE_FILE)
}

/** Save PRs and filter to cache, leaving unrelated cached settings intact */
export function saveCache(prs: PR[], repos: string[], filterQuery?: string): void {
  const existing = loadCache()
  writeCache({
    ...existing,
    prs,
    updatedAt: new Date().toISOString(),
    repos: [...repos].sort(),
    filterQuery: filterQuery ?? existing.filterQuery ?? "",
  })
}

/** Save just the filter query (without updating PRs) */
export function saveFilterQuery(filterQuery: string): void {
  const cache = loadCache()
  cache.filterQuery = filterQuery
  writeCache(cache)
}

/** Save column visibility settings */
export function saveColumnVisibility(columnVisibility: ColumnVisibility): void {
  const cache = loadCache()
  cache.columnVisibility = columnVisibility
  writeCache(cache)
}

/** Save the gate detail expand/collapse preference */
export function saveGateDetail(gateDetail: boolean): void {
  const cache = loadCache()
  cache.gateDetail = gateDetail
  writeCache(cache)
}

/** Get the gate detail preference — collapsed to the merge verdict alone by default */
export function getGateDetail(): boolean {
  return loadCache().gateDetail ?? false
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
