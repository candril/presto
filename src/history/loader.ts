/**
 * History persistence - load and save viewing history
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getConfigDir } from "../config"
import {
  defaultHistory,
  HISTORY_LIMITS,
  type History,
  type RecentAuthor,
  type VisitedRepo,
} from "./schema"

/** History file path */
const HISTORY_FILE = join(getConfigDir(), "history.json")

/** Load history from disk */
export function loadHistory(): History {
  if (!existsSync(HISTORY_FILE)) {
    return { ...defaultHistory }
  }

  try {
    const content = readFileSync(HISTORY_FILE, "utf-8")
    const raw = JSON.parse(content)
    // Migrate markedPRs from old formats to Record<prKey, letter>
    if (raw.markedPRs) {
      raw.markedPRs = migrateMarkedPRs(raw.markedPRs)
    }
    return { ...defaultHistory, ...raw }
  } catch {
    return { ...defaultHistory }
  }
}

/** Save history to disk */
export function saveHistory(history: History): void {
  // Trim to limits before saving
  const trimmed: History = {
    ...history,
    recentAuthors: history.recentAuthors.slice(0, HISTORY_LIMITS.recentAuthors),
    recentlyViewed: history.recentlyViewed.slice(
      0,
      HISTORY_LIMITS.recentlyViewed
    ),
    recentFilters: history.recentFilters.slice(0, HISTORY_LIMITS.recentFilters),
    visitedRepos: (history.visitedRepos ?? []).slice(0, HISTORY_LIMITS.visitedRepos),
  }

  writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2))
}

/** Debounced save history - coalesces rapid writes (e.g. during fast j/k navigation) */
let debouncedSaveTimeout: ReturnType<typeof setTimeout> | null = null

export function debouncedSaveHistory(history: History): void {
  if (debouncedSaveTimeout) {
    clearTimeout(debouncedSaveTimeout)
  }
  debouncedSaveTimeout = setTimeout(() => {
    saveHistory(history)
    debouncedSaveTimeout = null
  }, 500)
}

/** Toggle star status for an author */
export function toggleStarAuthor(history: History, author: string): History {
  const starred = new Set(history.starredAuthors)
  if (starred.has(author)) {
    starred.delete(author)
  } else {
    starred.add(author)
  }
  return { ...history, starredAuthors: [...starred] }
}

/** Check if an author is starred */
export function isAuthorStarred(history: History, author: string): boolean {
  return history.starredAuthors.includes(author)
}

/** Record that we viewed a PR by this author */
export function recordAuthorView(history: History, author: string): History {
  const now = new Date().toISOString()
  const existing = history.recentAuthors.find((a) => a.login === author)

  let recentAuthors: RecentAuthor[]
  if (existing) {
    // Move to front and increment count
    recentAuthors = [
      { ...existing, lastSeen: now, viewCount: existing.viewCount + 1 },
      ...history.recentAuthors.filter((a) => a.login !== author),
    ]
  } else {
    // Add new
    recentAuthors = [
      { login: author, lastSeen: now, viewCount: 1 },
      ...history.recentAuthors,
    ]
  }

  return { ...history, recentAuthors }
}

/** Record that we viewed a specific PR */
export function recordPRView(
  history: History,
  pr: { repo: string; number: number; title: string; author: string }
): History {
  const now = new Date().toISOString()

  // Remove if already exists, add to front
  const recentlyViewed = [
    { ...pr, viewedAt: now },
    ...history.recentlyViewed.filter(
      (p) => !(p.repo === pr.repo && p.number === pr.number)
    ),
  ]

  return { ...history, recentlyViewed }
}

/** Record a filter query that was used */
export function recordFilterQuery(history: History, query: string): History {
  if (!query.trim()) return history

  // Remove if already exists, add to front
  const recentFilters = [
    query.trim(),
    ...history.recentFilters.filter((f) => f !== query.trim()),
  ]

  return { ...history, recentFilters }
}

// ============================================================================
// PR Marking (spec 015 + spec 028 letter-based categories)
// ============================================================================

/** Get PR key from repo and number */
export function getPRKey(repo: string, number: number): string {
  return `${repo}#${number}`
}

/**
 * Migrate old markedPRs formats to current format: Record<prKey, letter>.
 * - Old format 1: string[] (spec 015) → each PR gets letter "m"
 * - Old format 2: Record<letter, prKey[]> (intermediate spec 028) → flip to prKey→letter
 * - Current format: Record<prKey, letter> → pass through
 */
export function migrateMarkedPRs(raw: unknown): Record<string, string> {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    // Old format: string[] — migrate to letter "m"
    const result: Record<string, string> = {}
    for (const key of raw) {
      if (typeof key === "string") result[key] = "m"
    }
    return result
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    // Detect old Record<letter, prKey[]> format: values are arrays
    const firstValue = Object.values(obj)[0]
    if (Array.isArray(firstValue)) {
      // Flip: letter → prKey[] becomes prKey → letter
      const result: Record<string, string> = {}
      for (const [letter, keys] of Object.entries(obj)) {
        for (const key of keys as string[]) {
          result[key] = letter
        }
      }
      return result
    }
    // Current format: Record<prKey, letter>
    return obj as Record<string, string>
  }
  return {}
}

/** Toggle a mark letter on a PR. If PR already has this letter, removes it. Otherwise sets it. */
export function toggleMarkPR(history: History, prKey: string, letter: string): History {
  const markedPRs = { ...history.markedPRs }
  if (markedPRs[prKey] === letter) {
    delete markedPRs[prKey]
  } else {
    markedPRs[prKey] = letter
  }
  return { ...history, markedPRs }
}

/** Check if a PR is marked. If letter is provided, checks that specific letter. */
export function isPRMarked(history: History, prKey: string, letter?: string): boolean {
  const mark = history.markedPRs?.[prKey]
  if (!mark) return false
  if (letter) return mark === letter
  return true
}

/** Get the mark letter for a PR, or null if not marked */
export function getPRMark(history: History, prKey: string): string | null {
  return history.markedPRs?.[prKey] ?? null
}

/** Get all PR keys with a specific mark letter */
export function getPRsWithMark(history: History, letter: string): string[] {
  return Object.entries(history.markedPRs ?? {})
    .filter(([, l]) => l === letter)
    .map(([key]) => key)
}

/** Get all used mark letters, sorted alphabetically */
export function getUsedMarkLetters(history: History): string[] {
  const letters = new Set(Object.values(history.markedPRs ?? {}))
  return [...letters].sort()
}

/** Get count of all marked PRs */
export function getMarkedPRCount(history: History): number {
  return Object.keys(history.markedPRs ?? {}).length
}

/** Get all marked PR keys */
export function getAllMarkedPRKeys(history: History): string[] {
  return Object.keys(history.markedPRs ?? {})
}

/** Check if a PR is in recent history */
export function isPRRecent(history: History, prKey: string): boolean {
  const [repo, numStr] = prKey.split("#")
  const number = parseInt(numStr, 10)
  return history.recentlyViewed.some(
    (r) => r.repo === repo && r.number === number
  )
}

/** Recency levels for visual indication */
export type RecencyLevel = "justNow" | "today" | "thisWeek" | "older"

/** Time thresholds for recency levels */
const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * ONE_DAY_MS

/**
 * Get the recency level of a PR
 * - "justNow": opened within last ~2 hours (brightest)
 * - "today": opened within last 24 hours
 * - "thisWeek": opened within last week
 * - "older": never opened or opened more than a week ago (dimmest)
 */
export function getPRRecencyLevel(history: History, prKey: string): RecencyLevel {
  const [repo, numStr] = prKey.split("#")
  const number = parseInt(numStr, 10)
  
  const entry = history.recentlyViewed.find(
    (r) => r.repo === repo && r.number === number
  )
  
  if (!entry) {
    return "older"
  }
  
  const viewedAt = new Date(entry.viewedAt).getTime()
  const now = Date.now()
  const age = now - viewedAt
  
  if (age < TWO_HOURS_MS) {
    return "justNow"
  } else if (age < ONE_DAY_MS) {
    return "today"
  } else if (age < ONE_WEEK_MS) {
    return "thisWeek"
  } else {
    return "older"
  }
}

/** Clear all marks */
export function clearAllMarks(history: History): History {
  return { ...history, markedPRs: {} }
}

/** Clear recent history */
export function clearRecentPRs(history: History): History {
  return { ...history, recentlyViewed: [] }
}

/** Remove a specific PR from recent history */
export function removePRFromRecent(history: History, prKey: string): History {
  const [repo, numStr] = prKey.split("#")
  const number = parseInt(numStr, 10)
  return {
    ...history,
    recentlyViewed: history.recentlyViewed.filter(
      (r) => !(r.repo === repo && r.number === number)
    ),
  }
}

// ============================================================================
// Visited Repos (spec 018)
// ============================================================================

/** Record a visit to a repository */
export function recordRepoVisit(history: History, repoName: string): History {
  const now = new Date().toISOString()
  const visitedRepos = history.visitedRepos ?? []

  const existing = visitedRepos.find((r) => r.name === repoName)

  let newVisitedRepos: VisitedRepo[]
  if (existing) {
    // Update existing - move to front
    newVisitedRepos = [
      { ...existing, lastVisit: now, visitCount: existing.visitCount + 1 },
      ...visitedRepos.filter((r) => r.name !== repoName),
    ]
  } else {
    // Add new
    newVisitedRepos = [
      { name: repoName, firstVisit: now, lastVisit: now, visitCount: 1 },
      ...visitedRepos,
    ]
  }

  return { ...history, visitedRepos: newVisitedRepos }
}

/** Remove a repo from visited history */
export function forgetRepo(history: History, repoName: string): History {
  const visitedRepos = history.visitedRepos ?? []
  return {
    ...history,
    visitedRepos: visitedRepos.filter((r) => r.name !== repoName),
  }
}

/** Check if a repo is in visited history */
export function isRepoVisited(history: History, repoName: string): boolean {
  return (history.visitedRepos ?? []).some((r) => r.name === repoName)
}
