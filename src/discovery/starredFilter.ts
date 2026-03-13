/**
 * Starred-only filter for repos like isomorph
 * 
 * Repos with starredOnly=true only show PRs from starred authors by default.
 * This can be bypassed by:
 * - Using * modifier (show all)
 * - Explicit repo filter (repo:name)
 * - Explicit author filter (@author)
 * - Direct PR reference (URL, #123, etc.)
 */

import type { PR } from "../types"
import { getRepoName } from "../types"
import type { Repository } from "../config"
import type { ParsedFilter } from "./parser"

export interface StarredFilterContext {
  starredAuthors: string[]
  repoConfig: Map<string, Repository>
}

export interface StarredFilterResult {
  filtered: PR[]
  hiddenCount: number
}

/**
 * Apply starred-only filter to PRs
 * 
 * Repos with starredOnly=true only show PRs from starred authors,
 * unless bypassed by showAll, explicit repo filter, or explicit author filter.
 */
export function applyStarredOnlyFilter(
  prs: PR[],
  filter: ParsedFilter,
  context: StarredFilterContext
): StarredFilterResult {
  // Bypass conditions:
  // 1. showAll modifier (*)
  // 2. explicit repo filter (repo:X)
  // 3. explicit author filter (@X)
  // 4. direct PR reference (URL, #123, etc.)
  const bypass =
    filter.showAll ||
    filter.repos.length > 0 ||
    filter.authors.length > 0 ||
    filter.prRef !== null

  if (bypass) {
    return { filtered: prs, hiddenCount: 0 }
  }

  let hiddenCount = 0
  const filtered = prs.filter((pr) => {
    const repoName = getRepoName(pr)
    const repoConf = context.repoConfig.get(repoName)

    // If repo doesn't have starredOnly, show all
    if (!repoConf?.starredOnly) {
      return true
    }

    // For starredOnly repos, only show starred authors
    const isStarred = context.starredAuthors.includes(pr.author.login)
    if (!isStarred) {
      hiddenCount++
    }
    return isStarred
  })

  return { filtered, hiddenCount }
}
