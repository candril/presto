/**
 * Hook for PR filtering logic
 * Handles parsing, applying filters, and starred-only filtering
 */

import { useMemo, useEffect, useRef, useState, useCallback } from "react"
import { parseFilter, applyFilter, applyStarredOnlyFilter } from "../discovery"
import { saveFilterQuery } from "../cache"
import { getPR } from "../providers/github"
import type { Config } from "../config"
import type { PR } from "../types"
import { getRepoName } from "../types"
import type { History } from "../history"
import { getPRKey, isPRMarked } from "../history"

export interface UseFilteringOptions {
  config: Config
  prs: PR[]
  discoveryQuery: string
  history: History
  dispatch: (action: any) => void
  currentUser: string | null
}

export function useFiltering({
  config,
  prs,
  discoveryQuery,
  history,
  dispatch,
  currentUser,
}: UseFilteringOptions) {
  // Cache for fetched PRs that aren't in the main list (closed/merged)
  const [fetchedPRs, setFetchedPRs] = useState<Map<string, PR>>(new Map())
  const fetchingRef = useRef<Set<string>>(new Set())

  // Parse filter from query string, resolving @me to current user
  const filter = useMemo(() => {
    const parsed = parseFilter(discoveryQuery)
    // Resolve @me to actual username
    if (currentUser && parsed.authors.includes("me")) {
      parsed.authors = parsed.authors.map((a) =>
        a === "me" ? currentUser.toLowerCase() : a
      )
    }
    return parsed
  }, [discoveryQuery, currentUser])

  // Build repo config map for starred-only filtering
  const repoConfig = useMemo(
    () => new Map(config.repositories.map((r) => [r.name, r])),
    [config.repositories]
  )

  // Combined PR list: main prs + fetched closed/merged PRs
  const allPRs = useMemo(() => {
    const prMap = new Map<string, PR>()
    // Add main PRs first
    for (const pr of prs) {
      prMap.set(getPRKey(getRepoName(pr), pr.number), pr)
    }
    // Add fetched PRs (closed/merged) that aren't already in main list
    for (const [key, pr] of fetchedPRs) {
      if (!prMap.has(key)) {
        prMap.set(key, pr)
      }
    }
    return Array.from(prMap.values())
  }, [prs, fetchedPRs])

  // Fetch missing PRs for >marked or >recent filters
  const fetchMissingPRs = useCallback(async (keys: string[]) => {
    const missing = keys.filter(key => {
      const inMain = prs.some(pr => getPRKey(getRepoName(pr), pr.number) === key)
      const inFetched = fetchedPRs.has(key)
      const isFetching = fetchingRef.current.has(key)
      return !inMain && !inFetched && !isFetching
    })

    if (missing.length === 0) return

    // Mark as fetching
    for (const key of missing) {
      fetchingRef.current.add(key)
    }

    // Fetch in parallel
    const results = await Promise.all(
      missing.map(async (key) => {
        const [repo, numStr] = key.split("#")
        const number = parseInt(numStr, 10)
        const pr = await getPR(repo, number)
        return { key, pr }
      })
    )

    // Update cache
    const newFetched = new Map(fetchedPRs)
    for (const { key, pr } of results) {
      fetchingRef.current.delete(key)
      if (pr) {
        newFetched.set(key, pr)
      }
    }
    setFetchedPRs(newFetched)
  }, [prs, fetchedPRs])

  // Trigger fetch when >marked or >recent filter is active
  useEffect(() => {
    if (filter.marked) {
      fetchMissingPRs(history.markedPRs)
    } else if (filter.recent) {
      const recentKeys = history.recentlyViewed.map(r => `${r.repo}#${r.number}`)
      fetchMissingPRs(recentKeys)
    }
  }, [filter.marked, filter.recent, history.markedPRs, history.recentlyViewed, fetchMissingPRs])

  // Apply filters: special tokens (>marked, >recent, >starred) bypass repo settings
  const { filteredPRs, hiddenCount } = useMemo(() => {
    // >marked - show only marked PRs (bypasses all repo settings)
    if (filter.marked) {
      let result = allPRs.filter((pr) => {
        const prKey = getPRKey(getRepoName(pr), pr.number)
        return isPRMarked(history, prKey)
      })
      // Apply other filters on top (text search, etc.)
      result = applyFilter(result, { ...filter, marked: false })
      return { filteredPRs: result, hiddenCount: 0 }
    }

    // >recent - show only recent PRs, sorted by recency (bypasses all repo settings)
    if (filter.recent) {
      const recentKeys = new Set(
        history.recentlyViewed.map((r) => `${r.repo}#${r.number}`)
      )
      let recentPRs = allPRs.filter((pr) => {
        const prKey = getPRKey(getRepoName(pr), pr.number)
        return recentKeys.has(prKey)
      })
      // Sort by recency order (history.recentlyViewed is already in order)
      const orderMap = new Map(
        history.recentlyViewed.map((r, i) => [`${r.repo}#${r.number}`, i])
      )
      recentPRs.sort((a, b) => {
        const orderA = orderMap.get(getPRKey(getRepoName(a), a.number)) ?? 999
        const orderB = orderMap.get(getPRKey(getRepoName(b), b.number)) ?? 999
        return orderA - orderB
      })
      // Apply other filters on top
      recentPRs = applyFilter(recentPRs, { ...filter, recent: false })
      return { filteredPRs: recentPRs, hiddenCount: 0 }
    }

    // >starred - show PRs from starred authors only (bypasses starredOnly repo setting)
    if (filter.starred) {
      let result = prs.filter((pr) => 
        history.starredAuthors.includes(pr.author.login)
      )
      // Apply other filters on top
      result = applyFilter(result, { ...filter, starred: false })
      return { filteredPRs: result, hiddenCount: 0 }
    }

    // Normal filtering: apply regular filter, then starred-only filter
    const afterFilter = applyFilter(prs, filter)
    const result = applyStarredOnlyFilter(afterFilter, filter, {
      starredAuthors: history.starredAuthors,
      repoConfig,
    })
    return { filteredPRs: result.filtered, hiddenCount: result.hiddenCount }
  }, [allPRs, prs, filter, repoConfig, history.starredAuthors, history.markedPRs, history.recentlyViewed])

  // Reset selection when filter changes
  useEffect(() => {
    dispatch({ type: "SELECT", index: 0 })
  }, [discoveryQuery, dispatch])

  // Save filter query when it changes (skip initial mount to avoid unnecessary write)
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    saveFilterQuery(discoveryQuery)
  }, [discoveryQuery])

  return { filter, filteredPRs, hiddenCount }
}
