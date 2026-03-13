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
