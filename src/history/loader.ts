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
    return { ...defaultHistory, ...JSON.parse(content) }
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
// PR Marking (spec 015)
// ============================================================================

/** Get PR key from repo and number */
export function getPRKey(repo: string, number: number): string {
  return `${repo}#${number}`
}

/** Toggle mark status for a PR */
export function toggleMarkPR(history: History, prKey: string): History {
  const marked = new Set(history.markedPRs ?? [])
  if (marked.has(prKey)) {
    marked.delete(prKey)
  } else {
    marked.add(prKey)
  }
  return { ...history, markedPRs: [...marked] }
}

/** Check if a PR is marked */
export function isPRMarked(history: History, prKey: string): boolean {
  return history.markedPRs?.includes(prKey) ?? false
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
  return { ...history, markedPRs: [] }
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
