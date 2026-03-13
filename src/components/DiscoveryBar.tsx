/**
 * Discovery bar component - search and filter PRs
 *
 * Features:
 * - Filter by @author, repo:name, or plain text
 * - Smart suggestions from history and current PRs
 * - Live filtering as you type
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import type { History } from "../history"
import type { PR } from "../types"
import { getRepoName } from "../types"

/** Suggestion item in the discovery bar */
interface Suggestion {
  type: "author" | "repo" | "quick" | "filter"
  value: string
  label: string
  count?: number
  starred?: boolean
}

interface DiscoveryBarProps {
  query: string
  onChange: (query: string) => void
  onClose: () => void
  history: History
  prs: PR[]
  filteredCount: number
}

export function DiscoveryBar({
  query,
  onChange,
  onClose,
  history,
  prs,
  filteredCount,
}: DiscoveryBarProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Build suggestions based on current query
  const suggestions = useMemo(() => {
    return buildSuggestions(query, history, prs)
  }, [query, history, prs])

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0)
  }, [suggestions.length])

  // Handle keyboard navigation
  useKeyboard((key) => {
    // Navigate suggestions with ctrl-n/ctrl-p or arrows
    if (key.name === "n" && key.ctrl) {
      setSelectedIndex((i) => Math.min(suggestions.length - 1, i + 1))
      return
    }
    if (key.name === "p" && key.ctrl) {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(suggestions.length - 1, i + 1))
      return
    }
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }

    // Select suggestion with Tab or ctrl-y
    if (key.name === "tab" || (key.name === "y" && key.ctrl)) {
      if (suggestions[selectedIndex]) {
        onChange(suggestions[selectedIndex].value)
      }
      return
    }

    // Close with Escape
    if (key.name === "escape") {
      onClose()
      return
    }
  })

  return (
    <box
      height={Math.min(2 + suggestions.length, 12)}
      width="100%"
      flexDirection="column"
      backgroundColor={theme.bg}
    >
      {/* Search input row */}
      <box height={1} paddingX={1} flexDirection="row">
        <text fg={theme.primary}>/</text>
        <input
          value={query}
          onChange={onChange}
          placeholder="@author, repo:name, or text..."
          focused={true}
          flexGrow={1}
          backgroundColor={theme.bg}
          textColor={theme.text}
          placeholderColor={theme.textDim}
        />
        <text fg={theme.textDim}>
          {filteredCount}/{prs.length}
        </text>
      </box>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <box flexDirection="column" paddingX={1}>
          {suggestions.slice(0, 8).map((suggestion, index) => (
            <SuggestionRow
              key={`${suggestion.type}-${suggestion.value}`}
              suggestion={suggestion}
              selected={index === selectedIndex}
            />
          ))}
        </box>
      )}
    </box>
  )
}

function SuggestionRow({
  suggestion,
  selected,
}: {
  suggestion: Suggestion
  selected: boolean
}) {
  const icon =
    suggestion.type === "author"
      ? suggestion.starred
        ? "★"
        : "@"
      : suggestion.type === "repo"
        ? "/"
        : suggestion.type === "quick"
          ? "⚡"
          : ">"

  return (
    <box height={1} backgroundColor={selected ? theme.headerBg : undefined}>
      <text>
        <span fg={suggestion.starred ? theme.warning : theme.textDim}>
          {icon}
        </span>
        {" "}
        <span fg={selected ? theme.primary : theme.text}>{suggestion.label}</span>
        {suggestion.count !== undefined && (
          <span fg={theme.textMuted}> ({suggestion.count})</span>
        )}
      </text>
    </box>
  )
}

/** Build suggestions based on current query and state */
function buildSuggestions(
  query: string,
  history: History,
  prs: PR[]
): Suggestion[] {
  const items: Suggestion[] = []
  const q = query.toLowerCase().trim()

  if (!q) {
    // Empty query - show defaults

    // Starred authors first
    for (const author of history.starredAuthors.slice(0, 3)) {
      items.push({
        type: "author",
        value: `@${author}`,
        label: author,
        count: countAuthorPRs(prs, author),
        starred: true,
      })
    }

    // Recent authors (not already starred)
    for (const recent of history.recentAuthors.slice(0, 3)) {
      if (!history.starredAuthors.includes(recent.login)) {
        items.push({
          type: "author",
          value: `@${recent.login}`,
          label: recent.login,
          count: countAuthorPRs(prs, recent.login),
        })
      }
    }

    // Top repos by PR count
    const repos = getTopRepos(prs, 3)
    for (const repo of repos) {
      items.push({
        type: "repo",
        value: `repo:${repo.name}`,
        label: repo.name,
        count: repo.count,
      })
    }

    // Recent filters
    for (const filter of history.recentFilters.slice(0, 2)) {
      items.push({
        type: "filter",
        value: filter,
        label: filter,
      })
    }
  } else if (q.startsWith("@")) {
    // Typing @author - suggest authors
    const partial = q.slice(1)
    const authors = getAllAuthors(prs, history)

    for (const author of authors) {
      if (author.login.toLowerCase().includes(partial)) {
        items.push({
          type: "author",
          value: `@${author.login}`,
          label: author.login,
          count: author.count,
          starred: history.starredAuthors.includes(author.login),
        })
      }
    }
  } else if (q.startsWith("repo:")) {
    // Typing repo: - suggest repos
    const partial = q.slice(5)
    const repos = getAllRepos(prs)

    for (const repo of repos) {
      if (repo.name.toLowerCase().includes(partial)) {
        items.push({
          type: "repo",
          value: `repo:${repo.name}`,
          label: repo.name,
          count: repo.count,
        })
      }
    }
  }

  return items
}

/** Count PRs by a specific author */
function countAuthorPRs(prs: PR[], author: string): number {
  return prs.filter(
    (pr) => pr.author.login.toLowerCase() === author.toLowerCase()
  ).length
}

/** Get all authors from PRs and history, sorted by PR count */
function getAllAuthors(
  prs: PR[],
  history: History
): { login: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const pr of prs) {
    const login = pr.author.login
    counts.set(login, (counts.get(login) || 0) + 1)
  }

  // Sort: starred first, then by count
  return [...counts.entries()]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => {
      const aStarred = history.starredAuthors.includes(a.login)
      const bStarred = history.starredAuthors.includes(b.login)
      if (aStarred && !bStarred) return -1
      if (!aStarred && bStarred) return 1
      return b.count - a.count
    })
}

/** Get all repos from PRs, sorted by PR count */
function getAllRepos(prs: PR[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const pr of prs) {
    const name = getRepoName(pr)
    counts.set(name, (counts.get(name) || 0) + 1)
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/** Get top N repos by PR count */
function getTopRepos(prs: PR[], limit: number): { name: string; count: number }[] {
  return getAllRepos(prs).slice(0, limit)
}
