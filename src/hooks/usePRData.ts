/**
 * Hook for PR data fetching and caching
 * Handles initial load, refresh, and on-demand PR fetching
 */

import { useEffect, useCallback } from "react"
import { listPRs, listPRsFromRepos, getPR } from "../providers/github"
import { loadCache, saveCache, isCacheValidForRepos } from "../cache"
import type { Config } from "../config"
import type { PR } from "../types"
import type { ParsedFilter } from "../discovery"

interface UsePRDataOptions {
  config: Config
  filter: ParsedFilter
  prs: PR[]
  dispatch: (action: any) => void
}

export function usePRData({ config, filter, prs, dispatch }: UsePRDataOptions) {
  // Fetch PRs from GitHub (only enabled repos)
  const fetchPRs = useCallback(async (showAsRefresh = false) => {
    const repos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)

    if (repos.length === 0) {
      dispatch({ type: "SET_LOADING", loading: true })
      try {
        const fetchedPRs = await listPRs()
        dispatch({ type: "SET_PRS", prs: fetchedPRs })
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to fetch PRs",
        })
      }
      return
    }

    if (showAsRefresh) {
      dispatch({ type: "SET_REFRESHING", refreshing: true })
    } else {
      dispatch({ type: "SET_LOADING", loading: true })
    }

    // Clear preview cache on refresh
    dispatch({ type: "CLEAR_PREVIEW_CACHE" })

    try {
      const fetchedPRs = await listPRsFromRepos(repos)
      dispatch({ type: "SET_PRS", prs: fetchedPRs })
      saveCache(fetchedPRs, repos)
    } catch (err) {
      dispatch({ type: "SET_REFRESHING", refreshing: false })
      dispatch({ type: "SET_LOADING", loading: false })
      if (!showAsRefresh) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to fetch PRs",
        })
      }
    }
  }, [config.repositories, dispatch])

  // Load cached data on mount, then revalidate
  useEffect(() => {
    const repos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)

    const cache = loadCache()
    if (isCacheValidForRepos(cache, repos) && cache.prs.length > 0) {
      dispatch({ type: "SET_PRS", prs: cache.prs })
      if (cache.filterQuery) {
        dispatch({ type: "SET_DISCOVERY_QUERY", query: cache.filterQuery })
      }
      fetchPRs(true)
    } else {
      fetchPRs(false)
    }
  }, []) // Only run on mount

  // Fetch PR on-demand when a URL/reference is pasted
  useEffect(() => {
    if (!filter.prRef) return

    const { repo, number } = filter.prRef

    // Check if we already have this PR
    const existingPR = prs.find((pr) => {
      if (pr.number !== number) return false
      if (repo) {
        const prRepo = pr.url.match(/github\.com\/([^/]+\/[^/]+)\/pull/)?.[1]
        return prRepo?.toLowerCase().includes(repo.toLowerCase())
      }
      return true
    })

    if (existingPR) return

    if (!repo || !repo.includes("/")) return

    dispatch({ type: "SHOW_MESSAGE", message: `Fetching PR #${number}...` })
    getPR(repo, number).then((pr) => {
      if (pr) {
        dispatch({ type: "SET_PRS", prs: [pr, ...prs] })
        dispatch({ type: "SHOW_MESSAGE", message: `Loaded PR #${number}` })
      } else {
        dispatch({ type: "SHOW_MESSAGE", message: `PR #${number} not found` })
      }
    })
  }, [filter.prRef?.repo, filter.prRef?.number])

  return { fetchPRs }
}
