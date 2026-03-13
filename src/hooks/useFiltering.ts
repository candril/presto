/**
 * Hook for PR filtering logic
 * Handles parsing, applying filters, and starred-only filtering
 */

import { useMemo, useEffect } from "react"
import { parseFilter, applyFilter, applyStarredOnlyFilter } from "../discovery"
import { saveFilterQuery } from "../cache"
import type { Config } from "../config"
import type { PR } from "../types"
import type { History } from "../history"

interface UseFilteringOptions {
  config: Config
  prs: PR[]
  discoveryQuery: string
  history: History
  dispatch: (action: any) => void
}

export function useFiltering({
  config,
  prs,
  discoveryQuery,
  history,
  dispatch,
}: UseFilteringOptions) {
  // Parse filter from query string
  const filter = useMemo(
    () => parseFilter(discoveryQuery),
    [discoveryQuery]
  )

  // Build repo config map for starred-only filtering
  const repoConfig = useMemo(
    () => new Map(config.repositories.map((r) => [r.name, r])),
    [config.repositories]
  )

  // Apply filters: first regular filter, then starred-only filter
  const { filteredPRs, hiddenCount } = useMemo(() => {
    const afterFilter = applyFilter(prs, filter)
    const result = applyStarredOnlyFilter(afterFilter, filter, {
      starredAuthors: history.starredAuthors,
      repoConfig,
    })
    return { filteredPRs: result.filtered, hiddenCount: result.hiddenCount }
  }, [prs, filter, repoConfig, history.starredAuthors])

  // Reset selection when filter changes
  useEffect(() => {
    dispatch({ type: "SELECT", index: 0 })
  }, [discoveryQuery, dispatch])

  // Save filter query when it changes
  useEffect(() => {
    saveFilterQuery(discoveryQuery)
  }, [discoveryQuery])

  return { filter, filteredPRs, hiddenCount }
}
