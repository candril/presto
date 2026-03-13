/**
 * Filter parsing for smart discovery
 * 
 * Supports:
 * - @username - filter by author
 * - repo:name - filter by repository
 * - state:open|closed|merged|draft - filter by state (P2)
 * - plain text - search in titles
 */

import type { PR } from "../types"

export interface ParsedFilter {
  authors: string[]      // @username entries
  repos: string[]        // repo:name entries
  states: string[]       // state:open entries
  text: string           // Remaining text for title search
}

export const emptyFilter: ParsedFilter = {
  authors: [],
  repos: [],
  states: [],
  text: "",
}

/** Check if a filter has any active criteria */
export function isFilterActive(filter: ParsedFilter): boolean {
  return (
    filter.authors.length > 0 ||
    filter.repos.length > 0 ||
    filter.states.length > 0 ||
    filter.text.length > 0
  )
}

/** Parse a query string into structured filter */
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

/** Apply filter to a list of PRs */
export function applyFilter(prs: PR[], filter: ParsedFilter): PR[] {
  if (!isFilterActive(filter)) {
    return prs
  }

  return prs.filter((pr) => {
    // Author filter
    if (filter.authors.length > 0) {
      const prAuthor = pr.author.login.toLowerCase()
      if (!filter.authors.includes(prAuthor)) return false
    }

    // Repo filter
    if (filter.repos.length > 0) {
      const prRepo = getRepoName(pr).toLowerCase()
      if (!filter.repos.some((r) => prRepo.includes(r))) return false
    }

    // State filter (P2 but parsing is ready)
    if (filter.states.length > 0) {
      const matches = filter.states.some((state) => {
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
      })
      if (!matches) return false
    }

    // Text search in title and author
    if (filter.text) {
      const searchable = `${pr.title} ${pr.author.login}`.toLowerCase()
      if (!searchable.includes(filter.text)) return false
    }

    return true
  })
}

/** Parse PR reference patterns like #123, repo#123, owner/repo#123, or GitHub URLs */
export function parsePRReference(
  query: string
): { repo?: string; number: number } | null {
  const trimmed = query.trim()

  // GitHub URL: https://github.com/owner/repo/pull/123
  const urlMatch = trimmed.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/)
  if (urlMatch) {
    return { repo: urlMatch[1], number: parseInt(urlMatch[2], 10) }
  }

  // Fully qualified: owner/repo#123
  const fullMatch = trimmed.match(/^([^/]+\/[^#]+)#(\d+)$/)
  if (fullMatch) {
    return { repo: fullMatch[1], number: parseInt(fullMatch[2], 10) }
  }

  // Repo shorthand: repo#123
  const repoMatch = trimmed.match(/^([a-zA-Z0-9_-]+)#(\d+)$/)
  if (repoMatch) {
    return { repo: repoMatch[1], number: parseInt(repoMatch[2], 10) }
  }

  // Just number: #123
  const numMatch = trimmed.match(/^#(\d+)$/)
  if (numMatch) {
    return { number: parseInt(numMatch[1], 10) }
  }

  return null
}

/** Get repo name from PR (handles url field) */
function getRepoName(pr: PR): string {
  // Extract from URL: https://github.com/owner/repo/pull/123
  const match = pr.url.match(/github\.com\/([^/]+\/[^/]+)\/pull/)
  return match ? match[1] : ""
}
