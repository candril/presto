/**
 * Discovery suggestions popup - anchored to bottom of content area, above command line
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import type { History } from "../history"
import type { PR } from "../types"
import { getRepoName } from "../types"
import type { Repository } from "../config"

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
  /** All configured repositories (including disabled ones) */
  repositories: Repository[]
}

export function DiscoverySuggestions({
  query,
  onChange,
  onClose,
  history,
  prs,
  repositories,
}: DiscoverySuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Build suggestions based on current query
  const suggestions = useMemo(() => {
    return buildSuggestions(query, history, prs, repositories)
  }, [query, history, prs, repositories])

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

  // Show suggestions in reverse order (selected at bottom, closest to input)
  const visibleSuggestions = suggestions.slice(0, 20)

  return (
    <box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      flexDirection="column"
      backgroundColor={theme.headerBg}
    >
      {visibleSuggestions.map((suggestion, index) => (
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
  prs: PR[],
  repositories: Repository[]
): Suggestion[] {
  const items: Suggestion[] = []
  const q = query.toLowerCase().trim()

  // Parse existing query to understand what's already filtered
  const tokens = q.split(/\s+/).filter(Boolean)
  const lastToken = tokens[tokens.length - 1] || ""
  
  // For appending new suggestions
  const existingQuery = q ? q + " " : ""
  
  // Check what kind of token we're currently typing
  const isTypingAuthor = lastToken.startsWith("@")
  const isTypingSpecialFilter = lastToken.startsWith(">")
  const isTypingRepo = lastToken.startsWith("repo:")
  const isTypingState = lastToken.startsWith("state:")
  const isTypingPrefix = isTypingAuthor || isTypingSpecialFilter || isTypingRepo || isTypingState
  
  // Check if query ends with space (ready for new token)
  const endsWithSpace = query.endsWith(" ")

  if (!q || endsWithSpace || lastToken === "*") {
    // Empty query OR user just finished a token - show things to add

    // Show special filter tokens first (if not already in query)
    const specialFilters = [
      { token: "@marked", label: "Marked PRs", count: history.markedPRs?.length || 0 },
      { token: "@recent", label: "Recent PRs", count: Object.keys(history.recentlyViewed || {}).length },
      { token: "@starred", label: "Starred authors", count: history.starredAuthors?.length || 0 },
    ]
    
    for (const filter of specialFilters) {
      if (!tokens.includes(filter.token)) {
        items.push({
          type: "filter",
          value: `${existingQuery}${filter.token}`,
          label: filter.label,
          count: filter.count,
        })
      }
    }

    // Show @me first (if not already in query)
    if (!tokens.includes("@me")) {
      items.push({
        type: "author",
        value: `${existingQuery}@me`,
        label: "me (my PRs)",
      })
    }

    // Show all starred authors (these are the important ones)
    // Skip if already filtering by this author
    const existingAuthors = tokens
      .filter(t => t.startsWith("@"))
      .map(t => t.slice(1).toLowerCase())
    
    for (const author of history.starredAuthors) {
      if (!existingAuthors.includes(author.toLowerCase())) {
        items.push({
          type: "author",
          value: `${existingQuery}@${author}`,
          label: author,
          count: countAuthorPRs(prs, author),
          starred: true,
        })
      }
    }

    // Show * to reveal all PRs (if not already present)
    if (!tokens.includes("*")) {
      items.push({
        type: "quick",
        value: `${existingQuery}*`,
        label: "Show all PRs",
      })
    }

    // Show all configured repos with PR counts
    // Skip if already filtering by this repo
    const existingRepos = tokens
      .filter(t => t.startsWith("repo:"))
      .map(t => t.slice(5).toLowerCase())
    
    const prCountByRepo = new Map<string, number>()
    for (const pr of prs) {
      const name = getRepoName(pr)
      prCountByRepo.set(name, (prCountByRepo.get(name) || 0) + 1)
    }

    for (const repo of repositories) {
      if (!existingRepos.some(r => repo.name.toLowerCase().includes(r))) {
        const count = prCountByRepo.get(repo.name) || 0
        const label = repo.disabled
          ? `${repo.alias || repo.name} (not loaded)`
          : repo.alias || repo.name
        items.push({
          type: "repo",
          value: `${existingQuery}repo:${repo.name}`,
          label,
          count: repo.disabled ? undefined : count,
        })
      }
    }
  } else {
    // User is typing a prefixed token - show filtered suggestions
    const prefix = tokens.slice(0, -1).join(" ")
    const prefixWithSpace = prefix ? prefix + " " : ""

    if (isTypingSpecialFilter) {
      // Typing > - suggest special filters only
      const partial = lastToken.slice(1).toLowerCase()
      
      const specialFilters = [
        { token: "@marked", label: "Marked PRs", count: history.markedPRs?.length || 0 },
        { token: "@recent", label: "Recent PRs", count: Object.keys(history.recentlyViewed || {}).length },
        { token: "@starred", label: "Starred authors", count: history.starredAuthors?.length || 0 },
      ]
      
      for (const filter of specialFilters) {
        // Match against the token name (without @)
        if (filter.token.slice(1).includes(partial)) {
          items.push({
            type: "filter",
            value: `${prefixWithSpace}${filter.token}`,
            label: filter.label,
            count: filter.count,
          })
        }
      }
    } else if (isTypingAuthor) {
      // Typing @author - suggest @me and authors
      const partial = lastToken.slice(1).toLowerCase()
      
      // @me shortcut
      if ("me".includes(partial)) {
        items.push({
          type: "author",
          value: `${prefixWithSpace}@me`,
          label: "me (my PRs)",
        })
      }
      
      // Then suggest authors
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
    } else if (isTypingRepo) {
      // Typing repo: - suggest repos (including disabled ones from config)
      const partial = lastToken.slice(5)
      const reposFromPRs = getAllRepos(prs)
      const seenRepos = new Set(reposFromPRs.map((r) => r.name))

      // First show repos we have PRs for
      for (const repo of reposFromPRs) {
        if (repo.name.toLowerCase().includes(partial)) {
          items.push({
            type: "repo",
            value: `${prefixWithSpace}repo:${repo.name}`,
            label: repo.name,
            count: repo.count,
          })
        }
      }

      // Then show disabled repos from config (no PRs loaded yet)
      for (const repo of repositories) {
        if (repo.disabled && !seenRepos.has(repo.name)) {
          const shortName = repo.alias || repo.name.split("/")[1] || repo.name
          if (
            repo.name.toLowerCase().includes(partial) ||
            shortName.toLowerCase().includes(partial)
          ) {
            items.push({
              type: "repo",
              value: `${prefixWithSpace}repo:${repo.name}`,
              label: `${repo.name} (not loaded)`,
            })
          }
        }
      }
    } else if (isTypingState) {
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
      // Replace the last token (what user is typing) with the selected suggestion

      // Filter matching authors
      const authors = getAllAuthors(prs, history)
      for (const author of authors) {
        if (author.login.toLowerCase().includes(lastToken)) {
          items.push({
            type: "author",
            value: `${prefixWithSpace}@${author.login}`,
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
            value: `${prefixWithSpace}repo:${repo.name}`,
            label: repo.name,
            count: repo.count,
          })
        }
      }
    }
  }

  // Dedupe by value
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.value)) return false
    seen.add(item.value)
    return true
  })
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
