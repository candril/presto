/**
 * Discovery suggestions dropdown - shows below header when filter is focused
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import type { History } from "../history"
import type { PR } from "../types"
import { getRepoName } from "../types"

/** Suggestion item */
interface Suggestion {
  type: "author" | "repo" | "quick" | "filter"
  value: string
  label: string
  count?: number
  starred?: boolean
}

interface DiscoverySuggestionsProps {
  query: string
  onChange: (query: string) => void
  onClose: () => void
  history: History
  prs: PR[]
}

export function DiscoverySuggestions({
  query,
  onChange,
  onClose,
  history,
  prs,
}: DiscoverySuggestionsProps) {
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
    // Navigate suggestions
    if (key.name === "down" || (key.name === "n" && key.ctrl)) {
      setSelectedIndex((i) => Math.min(suggestions.length - 1, i + 1))
      return
    }
    if (key.name === "up" || (key.name === "p" && key.ctrl)) {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }

    // Select suggestion with Tab or Ctrl-Y
    if (key.name === "tab" || (key.name === "y" && key.ctrl)) {
      if (suggestions[selectedIndex]) {
        onChange(suggestions[selectedIndex].value)
      }
      return
    }

    // Escape clears filter
    if (key.name === "escape") {
      onClose()
      return
    }
  })

  if (suggestions.length === 0) {
    return null
  }

  return (
    <box
      flexDirection="column"
      backgroundColor={theme.bg}
      maxHeight={10}
    >
      {suggestions.slice(0, 8).map((suggestion, index) => (
        <SuggestionRow
          key={`${suggestion.type}-${suggestion.value}`}
          suggestion={suggestion}
          selected={index === selectedIndex}
        />
      ))}
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
    <box height={1} paddingX={1} backgroundColor={selected ? theme.headerBg : undefined}>
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
  } else {
    // Check the last token being typed for special prefixes
    const tokens = q.split(/\s+/)
    const lastToken = tokens[tokens.length - 1] || ""
    const prefix = tokens.slice(0, -1).join(" ")
    const prefixWithSpace = prefix ? prefix + " " : ""

    if (lastToken.startsWith("@")) {
      // Typing @author - suggest authors
      const partial = lastToken.slice(1)
      const authors = getAllAuthors(prs, history)

      for (const author of authors) {
        if (author.login.toLowerCase().includes(partial)) {
          items.push({
            type: "author",
            value: `${prefixWithSpace}@${author.login}`,
            label: author.login,
            count: author.count,
            starred: history.starredAuthors.includes(author.login),
          })
        }
      }
    } else if (lastToken.startsWith("repo:")) {
      // Typing repo: - suggest repos
      const partial = lastToken.slice(5)
      const repos = getAllRepos(prs)

      for (const repo of repos) {
        if (repo.name.toLowerCase().includes(partial)) {
          items.push({
            type: "repo",
            value: `${prefixWithSpace}repo:${repo.name}`,
            label: repo.name,
            count: repo.count,
          })
        }
      }
    } else if (lastToken.startsWith("state:")) {
      // Typing state: - suggest state options
      const partial = lastToken.slice(6)
      const states = [
        { value: "open", label: "Open", count: countByState(prs, "open") },
        { value: "closed", label: "Closed", count: countByState(prs, "closed") },
        { value: "merged", label: "Merged", count: countByState(prs, "merged") },
        { value: "draft", label: "Draft", count: countByState(prs, "draft") },
      ]

      for (const state of states) {
        if (state.value.includes(partial) || state.label.toLowerCase().includes(partial)) {
          items.push({
            type: "quick",
            value: `${prefixWithSpace}state:${state.value}`,
            label: state.label,
            count: state.count,
          })
        }
      }
    } else {
      // Plain text - filter all suggestion types that match

      // Filter matching authors
      const authors = getAllAuthors(prs, history)
      for (const author of authors) {
        if (author.login.toLowerCase().includes(lastToken)) {
          items.push({
            type: "author",
            value: `@${author.login}`,
            label: author.login,
            count: author.count,
            starred: history.starredAuthors.includes(author.login),
          })
        }
      }

      // Filter matching repos
      const repos = getAllRepos(prs)
      for (const repo of repos) {
        const shortName = repo.name.split("/")[1] || repo.name
        if (
          repo.name.toLowerCase().includes(lastToken) ||
          shortName.toLowerCase().includes(lastToken)
        ) {
          items.push({
            type: "repo",
            value: `repo:${repo.name}`,
            label: repo.name,
            count: repo.count,
          })
        }
      }

      // Filter matching recent filters
      for (const filter of history.recentFilters) {
        if (filter.toLowerCase().includes(lastToken)) {
          items.push({
            type: "filter",
            value: filter,
            label: filter,
          })
        }
      }
    }
  }

  return items
}

function countAuthorPRs(prs: PR[], author: string): number {
  return prs.filter(
    (pr) => pr.author.login.toLowerCase() === author.toLowerCase()
  ).length
}

function countByState(prs: PR[], state: string): number {
  return prs.filter((pr) => {
    switch (state) {
      case "open":
        return pr.state === "OPEN" && !pr.isDraft
      case "closed":
        return pr.state === "CLOSED"
      case "merged":
        return pr.state === "MERGED"
      case "draft":
        return pr.isDraft
      default:
        return false
    }
  }).length
}

function getAllAuthors(
  prs: PR[],
  history: History
): { login: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const pr of prs) {
    const login = pr.author.login
    counts.set(login, (counts.get(login) || 0) + 1)
  }

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

function getTopRepos(prs: PR[], limit: number): { name: string; count: number }[] {
  return getAllRepos(prs).slice(0, limit)
}
