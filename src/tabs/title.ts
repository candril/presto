/**
 * Human-readable title generation from filter queries
 */

import { parseFilter } from "../discovery/parser"
import type { Repository } from "../config/schema"

/** Options for title generation */
export interface TitleOptions {
  /** Repository config for alias lookup */
  repositories?: Repository[]
}

/**
 * Generate a human-readable title from a filter query
 * 
 * Examples:
 * - "" -> "All PRs"
 * - "@alice" -> "Alice's PRs"
 * - "@me" -> "My PRs"
 * - "state:draft" -> "Drafts"
 * - "state:draft @alice" -> "Alice's Drafts"
 * - "repo:api" -> "api"
 * - ">marked" -> "Marked"
 * - ">recent" -> "Recent"
 * - ">starred" -> "Starred"
 * - "repo:api >starred" -> "api (★)"
 * - "repo:api repo:web >starred" -> "api | web (★)"
 * - "fix bug" -> "\"fix bug\""
 */
export function generateTabTitle(filterQuery: string, options?: TitleOptions): string {
  if (!filterQuery.trim()) {
    return "All PRs"
  }

  const filter = parseFilter(filterQuery)
  const parts: string[] = []
  const modifiers: string[] = []

  // Special filters - if alone, return just the name
  // If combined with other filters, add as modifier
  if (filter.marked) {
    if (!filter.repos.length && !filter.authors.length && !filter.states.length && !filter.text && !filter.showAll) {
      return "Marked"
    }
    modifiers.push("marked")
  }
  if (filter.recent) {
    if (!filter.repos.length && !filter.authors.length && !filter.states.length && !filter.text && !filter.showAll) {
      return "Recent"
    }
    modifiers.push("recent")
  }
  if (filter.starred) {
    if (!filter.repos.length && !filter.authors.length && !filter.states.length && !filter.text && !filter.showAll) {
      return "Starred"
    }
    // Don't add modifier - the filter itself is enough context
  }

  // Show all modifier - if alone return "All PRs", otherwise just ignore it in title
  // (the repos/authors will be shown, no need to indicate "all")
  if (filter.showAll && !filter.authors.length && !filter.states.length && !filter.repos.length && !filter.text) {
    return "All PRs"
  }

  // Author
  if (filter.authors.length > 0) {
    const author = filter.authors[0]
    if (author === "me" || author === "@me") {
      parts.push("My")
    } else {
      parts.push(`${formatUsername(author)}'s`)
    }
  }

  // State
  if (filter.states.length > 0) {
    const state = filter.states[0]
    switch (state) {
      case "draft":
        parts.push("Drafts")
        break
      case "open":
        parts.push("Open")
        break
      case "closed":
        parts.push("Closed")
        break
      case "merged":
        parts.push("Merged")
        break
    }
  }

  // Repos - show all of them, pipe separated
  if (filter.repos.length > 0) {
    const repoNames = filter.repos.map(repo => getRepoDisplayName(repo, options?.repositories))
    if (parts.length > 0) {
      parts.push(`in ${repoNames.join(" | ")}`)
    } else {
      parts.push(repoNames.join(" | "))
    }
  }

  // Excluded repos
  if (filter.excludeRepos.length > 0) {
    const excludedNames = filter.excludeRepos.map(repo => getRepoDisplayName(repo, options?.repositories))
    parts.push(`-${excludedNames.join(" | -")}`)
  }

  // Excluded authors
  if (filter.excludeAuthors.length > 0) {
    const excludedAuthors = filter.excludeAuthors.map(a => `@${a}`)
    parts.push(`-${excludedAuthors.join(" -")}`)
  }

  // Text search
  if (filter.text) {
    const truncated = filter.text.length > 20 
      ? filter.text.slice(0, 17) + "..." 
      : filter.text
    parts.push(`"${truncated}"`)
  }

  // If we only have "My" or author's, add "PRs"
  if (parts.length === 1 && (parts[0] === "My" || parts[0].endsWith("'s"))) {
    parts.push("PRs")
  }

  // If nothing matched, return quoted query
  if (parts.length === 0) {
    const truncated = filterQuery.length > 20 
      ? filterQuery.slice(0, 17) + "..." 
      : filterQuery
    return `"${truncated}"`
  }

  // Add modifiers at the end
  let title = parts.join(" ")
  if (modifiers.length > 0) {
    title += ` (${modifiers.join(", ")})`
  }

  return title
}

/** Format username for display */
function formatUsername(username: string): string {
  // Capitalize first letter
  return username.charAt(0).toUpperCase() + username.slice(1)
}

/** Get display name for a repo (alias or short name) */
function getRepoDisplayName(repo: string, repositories?: Repository[]): string {
  // Try to find alias from config
  const repoConfig = repositories?.find(r => 
    r.name.toLowerCase().includes(repo.toLowerCase())
  )
  if (repoConfig?.alias) {
    return repoConfig.alias
  }
  // Fall back to short name (last part after /)
  return repo.split("/").pop() || repo
}
