# Smart Discovery

**Status**: Draft

## Description

Unified discovery bar for finding PRs by author, repo, state, or text search. Features smart suggestions showing recent and starred authors without needing to remember names. Tracks viewing history and allows starring favorite authors for quick access.

**Note**: P1 filters the locally-loaded PR list only (instant, no API calls). P2 adds GitHub API fallback for PR references not found locally.

## Out of Scope

- Saved/named searches
- Complex boolean query syntax
- Full GitHub search API syntax
- Sync history across devices

## Capabilities

### P1 - Must Have

- **Discovery bar**: `/` to open, `Escape` to close
- **Author filter**: `@username` syntax filters to that author
- **Repo filter**: `repo:name` syntax filters to that repo
- **Text search**: Plain text searches PR titles
- **Smart suggestions**: Show suggestions immediately when bar opens
  - Recent authors (from viewing history)
  - Starred authors (marked with ★)
  - Recent repositories
- **Star author**: Press `s` on a PR to star/unstar its author
- **History persistence**: Store in `~/.config/presto/history.json`
- **Live filtering**: Update PR list as user types

### P2 - Should Have

- **State filter**: `state:open`, `state:closed`, `state:draft`, `state:merged`
- **Combined filters**: Multiple filters work together (`@alice repo:api state:open`)
- **PR counts**: Show count next to authors/repos in suggestions
- **Keyboard navigation**: `j`/`k` or arrows to navigate suggestions, `Enter` to select
- **Quick filters in suggestions**:
  - "My PRs" - authored by current user
  - "Needs my review" - review requested from me
- **Clear indicators**: Show active filters in status bar with easy clear option
- **GitHub fallback search**: When no local results found, offer to search GitHub API
  - Detect PR references: `#123`, `repo#123`, `owner/repo#123`, GitHub URLs
  - Show "Search GitHub for #123?" suggestion
  - On select: fetch from API, add to list, select the PR
  - Only triggers on explicit user action (not automatic)

### P3 - Nice to Have

- **Fuzzy matching**: Fuzzy search on author names and repo names
- **Recently viewed PRs**: Section showing PRs you recently expanded/viewed
- **Following tab**: Dedicated tab showing only starred authors' PRs
- **Author stats**: Show "last active" or "X PRs this week" in suggestions
- **Filter history**: Remember and suggest recent filter combinations

## Technical Notes

### History File Schema

```typescript
// src/history/schema.ts
export interface History {
  /** Authors the user has starred */
  starredAuthors: string[]
  
  /** Recently seen authors (from viewing their PRs) */
  recentAuthors: RecentAuthor[]
  
  /** Recently viewed PRs */
  recentlyViewed: RecentPR[]
  
  /** Recently used filter queries */
  recentFilters: string[]
}

export interface RecentAuthor {
  login: string
  lastSeen: string  // ISO date
  viewCount: number
}

export interface RecentPR {
  repo: string      // "owner/repo"
  number: number
  title: string
  author: string
  viewedAt: string  // ISO date
}

export const defaultHistory: History = {
  starredAuthors: [],
  recentAuthors: [],
  recentlyViewed: [],
  recentFilters: [],
}

/** Maximum items to keep in history */
export const HISTORY_LIMITS = {
  recentAuthors: 20,
  recentlyViewed: 50,
  recentFilters: 10,
}
```

### History Loader

```typescript
// src/history/loader.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getConfigDir } from "../config"
import { defaultHistory, HISTORY_LIMITS, type History } from "./schema"

const HISTORY_FILE = join(getConfigDir(), "history.json")

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

export function saveHistory(history: History): void {
  // Trim to limits before saving
  const trimmed: History = {
    ...history,
    recentAuthors: history.recentAuthors.slice(0, HISTORY_LIMITS.recentAuthors),
    recentlyViewed: history.recentlyViewed.slice(0, HISTORY_LIMITS.recentlyViewed),
    recentFilters: history.recentFilters.slice(0, HISTORY_LIMITS.recentFilters),
  }
  
  writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2))
}

export function toggleStarAuthor(history: History, author: string): History {
  const starred = new Set(history.starredAuthors)
  if (starred.has(author)) {
    starred.delete(author)
  } else {
    starred.add(author)
  }
  return { ...history, starredAuthors: [...starred] }
}

export function recordAuthorView(history: History, author: string): History {
  const now = new Date().toISOString()
  const existing = history.recentAuthors.find(a => a.login === author)
  
  let recentAuthors: RecentAuthor[]
  if (existing) {
    // Move to front and increment count
    recentAuthors = [
      { ...existing, lastSeen: now, viewCount: existing.viewCount + 1 },
      ...history.recentAuthors.filter(a => a.login !== author),
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

export function recordPRView(history: History, pr: { repo: string; number: number; title: string; author: string }): History {
  const now = new Date().toISOString()
  
  // Remove if already exists, add to front
  const recentlyViewed = [
    { ...pr, viewedAt: now },
    ...history.recentlyViewed.filter(p => !(p.repo === pr.repo && p.number === pr.number)),
  ]
  
  return { ...history, recentlyViewed }
}
```

### Filter Parsing

```typescript
// src/discovery/parser.ts
export interface ParsedFilter {
  authors: string[]      // @username entries
  repos: string[]        // repo:name entries
  states: string[]       // state:open entries
  text: string           // Remaining text for title search
}

export function parseFilter(query: string): ParsedFilter {
  const result: ParsedFilter = {
    authors: [],
    repos: [],
    states: [],
    text: "",
  }
  
  const tokens = query.split(/\s+/).filter(Boolean)
  const textParts: string[] = []
  
  for (const token of tokens) {
    if (token.startsWith("@")) {
      result.authors.push(token.slice(1).toLowerCase())
    } else if (token.startsWith("repo:")) {
      result.repos.push(token.slice(5).toLowerCase())
    } else if (token.startsWith("state:")) {
      result.states.push(token.slice(6).toLowerCase())
    } else {
      textParts.push(token)
    }
  }
  
  result.text = textParts.join(" ").toLowerCase()
  return result
}

/** Parse PR reference patterns like #123, repo#123, owner/repo#123, or GitHub URLs */
export function parsePRReference(query: string): { repo?: string; number: number } | null {
  // GitHub URL: https://github.com/owner/repo/pull/123
  const urlMatch = query.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/)
  if (urlMatch) {
    return { repo: urlMatch[1], number: parseInt(urlMatch[2], 10) }
  }
  
  // Fully qualified: owner/repo#123
  const fullMatch = query.match(/^([^/]+\/[^#]+)#(\d+)$/)
  if (fullMatch) {
    return { repo: fullMatch[1], number: parseInt(fullMatch[2], 10) }
  }
  
  // Repo shorthand: repo#123
  const repoMatch = query.match(/^([^#]+)#(\d+)$/)
  if (repoMatch) {
    return { repo: repoMatch[1], number: parseInt(repoMatch[2], 10) }
  }
  
  // Just number: #123
  const numMatch = query.match(/^#(\d+)$/)
  if (numMatch) {
    return { number: parseInt(numMatch[1], 10) }
  }
  
  return null
}

export function applyFilter(prs: PR[], filter: ParsedFilter, currentUser?: string): PR[] {
  return prs.filter(pr => {
    // Author filter
    if (filter.authors.length > 0) {
      const prAuthor = pr.author.login.toLowerCase()
      if (!filter.authors.includes(prAuthor)) return false
    }
    
    // Repo filter
    if (filter.repos.length > 0) {
      const prRepo = pr.repository.nameWithOwner.toLowerCase()
      const repoName = prRepo.split("/")[1]
      if (!filter.repos.some(r => prRepo.includes(r) || repoName === r)) return false
    }
    
    // State filter
    if (filter.states.length > 0) {
      const matches = filter.states.some(state => {
        switch (state) {
          case "open": return pr.state === "OPEN" && !pr.isDraft
          case "closed": return pr.state === "CLOSED"
          case "merged": return pr.state === "MERGED"
          case "draft": return pr.isDraft
          default: return false
        }
      })
      if (!matches) return false
    }
    
    // Text search
    if (filter.text) {
      const searchable = `${pr.title} ${pr.author.login}`.toLowerCase()
      if (!searchable.includes(filter.text)) return false
    }
    
    return true
  })
}
```

### Discovery Bar Component

```tsx
// src/components/DiscoveryBar.tsx
import { useState, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import type { History } from "../history/schema"
import type { PR } from "../types"

interface Suggestion {
  type: "author" | "repo" | "quick" | "recent-pr"
  value: string
  label: string
  count?: number
  starred?: boolean
}

interface DiscoveryBarProps {
  visible: boolean
  query: string
  onChange: (query: string) => void
  onClose: () => void
  onSelect: (suggestion: Suggestion) => void
  history: History
  prs: PR[]
  currentUser?: string
}

export function DiscoveryBar({
  visible,
  query,
  onChange,
  onClose,
  onSelect,
  history,
  prs,
  currentUser,
}: DiscoveryBarProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  // Build suggestions
  const suggestions = useMemo(() => {
    const items: Suggestion[] = []
    
    if (!query) {
      // Show defaults when empty
      
      // Quick filters
      items.push({ type: "quick", value: "mine", label: "My PRs", count: countMyPRs(prs, currentUser) })
      items.push({ type: "quick", value: "review", label: "Needs my review", count: countReviewRequests(prs, currentUser) })
      
      // Starred authors
      for (const author of history.starredAuthors) {
        items.push({
          type: "author",
          value: `@${author}`,
          label: author,
          count: countAuthorPRs(prs, author),
          starred: true,
        })
      }
      
      // Recent authors (not already starred)
      for (const recent of history.recentAuthors.slice(0, 5)) {
        if (!history.starredAuthors.includes(recent.login)) {
          items.push({
            type: "author",
            value: `@${recent.login}`,
            label: recent.login,
            count: countAuthorPRs(prs, recent.login),
          })
        }
      }
      
      // Recent repos
      const recentRepos = getRecentRepos(history.recentlyViewed, 3)
      for (const repo of recentRepos) {
        items.push({
          type: "repo",
          value: `repo:${repo}`,
          label: repo,
          count: countRepoPRs(prs, repo),
        })
      }
    } else {
      // Filter suggestions based on query
      const q = query.toLowerCase()
      
      // If typing @, suggest authors
      if (q.startsWith("@")) {
        const partial = q.slice(1)
        const allAuthors = getAllAuthors(prs, history)
        for (const author of allAuthors) {
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
      }
      
      // If typing repo:, suggest repos
      else if (q.startsWith("repo:")) {
        const partial = q.slice(5)
        const allRepos = getAllRepos(prs)
        for (const repo of allRepos) {
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
    }
    
    return items
  }, [query, history, prs, currentUser])
  
  useKeyboard((key) => {
    if (!visible) return
    
    switch (key.name) {
      case "escape":
        onClose()
        break
      case "enter":
        if (suggestions[selectedIndex]) {
          onSelect(suggestions[selectedIndex])
        }
        break
      case "up":
      case "k":
        setSelectedIndex(i => Math.max(0, i - 1))
        break
      case "down":
      case "j":
        setSelectedIndex(i => Math.min(suggestions.length - 1, i + 1))
        break
    }
  })
  
  if (!visible) return null
  
  return (
    <box
      position="absolute"
      top={1}
      left={0}
      right={0}
      backgroundColor={theme.bg}
      border={{ type: "rounded", fg: theme.primary }}
      flexDirection="column"
      padding={1}
    >
      {/* Search input */}
      <box height={1} marginBottom={1}>
        <text fg={theme.primary}>/</text>
        <input
          value={query}
          onChange={onChange}
          placeholder="Search: @author, repo:name, or text..."
          focused={true}
          flexGrow={1}
        />
      </box>
      
      {/* Suggestions */}
      <box flexDirection="column" maxHeight={10}>
        {suggestions.length === 0 ? (
          <text fg={theme.textDim}>No suggestions</text>
        ) : (
          suggestions.map((suggestion, index) => (
            <SuggestionRow
              key={`${suggestion.type}-${suggestion.value}`}
              suggestion={suggestion}
              selected={index === selectedIndex}
            />
          ))
        )}
      </box>
      
      {/* Help text */}
      <box height={1} marginTop={1}>
        <text fg={theme.textMuted}>
          j/k: navigate  Enter: select  Esc: close
        </text>
      </box>
    </box>
  )
}

function SuggestionRow({ suggestion, selected }: { suggestion: Suggestion; selected: boolean }) {
  const icon = suggestion.type === "author" 
    ? (suggestion.starred ? "★" : "@")
    : suggestion.type === "repo"
    ? "📁"
    : "⚡"
  
  return (
    <box
      height={1}
      backgroundColor={selected ? theme.headerBg : undefined}
      paddingLeft={1}
    >
      <text>
        <span fg={suggestion.starred ? theme.warning : theme.textDim}>{icon}</span>
        {" "}
        <span fg={selected ? theme.primary : theme.text}>{suggestion.label}</span>
        {suggestion.count !== undefined && (
          <span fg={theme.textMuted}> ({suggestion.count})</span>
        )}
      </text>
    </box>
  )
}

// Helper functions
function countMyPRs(prs: PR[], user?: string): number {
  if (!user) return 0
  return prs.filter(pr => pr.author.login === user).length
}

function countReviewRequests(prs: PR[], user?: string): number {
  if (!user) return 0
  return prs.filter(pr => pr.reviewRequests?.some(r => r.login === user)).length
}

function countAuthorPRs(prs: PR[], author: string): number {
  return prs.filter(pr => pr.author.login.toLowerCase() === author.toLowerCase()).length
}

function countRepoPRs(prs: PR[], repo: string): number {
  return prs.filter(pr => pr.repository.nameWithOwner.includes(repo)).length
}

function getAllAuthors(prs: PR[], history: History): { login: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const pr of prs) {
    counts.set(pr.author.login, (counts.get(pr.author.login) || 0) + 1)
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

function getAllRepos(prs: PR[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const pr of prs) {
    const name = pr.repository.nameWithOwner
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

function getRecentRepos(viewed: RecentPR[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const pr of viewed) {
    if (!seen.has(pr.repo)) {
      seen.add(pr.repo)
      result.push(pr.repo)
      if (result.length >= limit) break
    }
  }
  return result
}
```

### State Integration

```typescript
// src/state.ts additions
export interface AppState {
  // ... existing
  discoveryVisible: boolean
  discoveryQuery: string
  activeFilters: ParsedFilter | null
}

export type AppAction =
  // ... existing
  | { type: "OPEN_DISCOVERY" }
  | { type: "CLOSE_DISCOVERY" }
  | { type: "SET_DISCOVERY_QUERY"; query: string }
  | { type: "APPLY_FILTER"; filter: ParsedFilter }
  | { type: "CLEAR_FILTERS" }
```

### Keyboard Integration

```tsx
// In App.tsx
useKeyboard((key) => {
  // Star author with 's' on selected PR
  if (key.name === "s" && !state.discoveryVisible) {
    const pr = state.prs[state.selectedIndex]
    if (pr) {
      const newHistory = toggleStarAuthor(history, pr.author.login)
      setHistory(newHistory)
      saveHistory(newHistory)
      dispatch({ type: "SHOW_MESSAGE", message: `${newHistory.starredAuthors.includes(pr.author.login) ? "Starred" : "Unstarred"} @${pr.author.login}` })
    }
    return
  }
  
  // Open discovery with '/'
  if (key.name === "/" && !state.discoveryVisible) {
    dispatch({ type: "OPEN_DISCOVERY" })
    return
  }
})
```

## File Structure

```
src/
├── history/
│   ├── index.ts              # Module exports
│   ├── schema.ts             # History types
│   └── loader.ts             # Load/save history
├── discovery/
│   ├── index.ts              # Module exports
│   └── parser.ts             # Filter parsing
├── components/
│   └── DiscoveryBar.tsx      # Discovery overlay
├── hooks/
│   └── useFilteredPRs.ts     # Apply filters to PR list
└── state.ts                  # Add discovery state
```
