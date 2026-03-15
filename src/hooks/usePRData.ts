/**
 * Hook for PR data fetching and caching
 * Handles initial load, refresh, and on-demand PR fetching
 */

import { useEffect, useCallback } from "react"
import { listPRs, listPRsFromRepos, getPR } from "../providers/github"
import { loadCache, saveCache, isCacheValidForRepos } from "../cache"
import { recordPRView, saveHistory, type History } from "../history"
import type { Config } from "../config"
import type { PR } from "../types"
import { getRepoName } from "../types"
import type { ParsedFilter } from "../discovery"

interface UsePRDataOptions {
  config: Config
  filter: ParsedFilter
  prs: PR[]
  dispatch: (action: any) => void
  history: History
  setHistory: (history: History) => void
  currentUser: string | null
}

export function usePRData({ config, filter, prs, dispatch, history, setHistory, currentUser }: UsePRDataOptions) {
  /**
   * Get tracked PR keys that are NOT in configured repos.
   * These need to be fetched individually during refresh for notification detection.
   */
  const getTrackedPRsFromNonConfiguredRepos = useCallback((): Array<{ repo: string; number: number }> => {
    const enabledRepos = new Set(
      config.repositories.filter((r) => !r.disabled).map((r) => r.name.toLowerCase())
    )

    // Collect tracked PR keys: marked + recently viewed + my PRs (via snapshots)
    const trackedKeys = new Set([
      ...(history.markedPRs ?? []),
      ...(history.recentlyViewed ?? []).map((r) => `${r.repo}#${r.number}`),
    ])

    // Parse keys and filter out PRs from enabled repos
    const result: Array<{ repo: string; number: number }> = []
    for (const key of trackedKeys) {
      const match = key.match(/^(.+)#(\d+)$/)
      if (!match) continue
      const [, repo, numStr] = match
      // Skip if repo is enabled (will be fetched normally)
      if (enabledRepos.has(repo.toLowerCase())) continue
      result.push({ repo, number: parseInt(numStr, 10) })
    }

    return result
  }, [config.repositories, history.markedPRs, history.recentlyViewed])

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
        dispatch({ type: "SET_LAST_REFRESH", time: new Date() })
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
      // Fetch PRs from configured repos
      const fetchedPRs = await listPRsFromRepos(repos)

      // Also fetch tracked PRs from non-configured repos (for notification detection)
      const trackedFromOtherRepos = getTrackedPRsFromNonConfiguredRepos()
      let allPRs = fetchedPRs

      if (trackedFromOtherRepos.length > 0) {
        const trackedPRs = await Promise.all(
          trackedFromOtherRepos.map(({ repo, number }) => getPR(repo, number))
        )
        // Add successfully fetched tracked PRs (filter out nulls)
        const validTrackedPRs = trackedPRs.filter((pr): pr is PR => pr !== null)
        if (validTrackedPRs.length > 0) {
          // Merge, avoiding duplicates
          const existingKeys = new Set(fetchedPRs.map((pr) => `${getRepoName(pr)}#${pr.number}`))
          const newTracked = validTrackedPRs.filter(
            (pr) => !existingKeys.has(`${getRepoName(pr)}#${pr.number}`)
          )
          allPRs = [...fetchedPRs, ...newTracked]
        }
      }

      dispatch({ type: "SET_PRS", prs: allPRs })
      dispatch({ type: "SET_LAST_REFRESH", time: new Date() })
      // Only cache PRs from configured repos
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
  }, [config.repositories, dispatch, getTrackedPRsFromNonConfiguredRepos])

  // Load cached data on mount, then revalidate
  useEffect(() => {
    const repos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)

    const cache = loadCache()
    if (isCacheValidForRepos(cache, repos) && cache.prs.length > 0) {
      // Load cached PRs for instant display, then refresh in background
      // Note: filter query is loaded in createInitialState()
      dispatch({ type: "SET_PRS", prs: cache.prs })
      fetchPRs(true)
    } else {
      fetchPRs(false)
    }
  }, []) // Only run on mount

  // Fetch PR on-demand when a URL/reference is pasted in filter bar
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

    // If we have it, record as viewed (pasting = looking at it)
    if (existingPR) {
      const newHistory = recordPRView(history, {
        repo: getRepoName(existingPR),
        number: existingPR.number,
        title: existingPR.title,
        author: existingPR.author.login,
      })
      setHistory(newHistory)
      saveHistory(newHistory)
      return
    }

    if (!repo || !repo.includes("/")) return

    dispatch({ type: "SHOW_MESSAGE", message: `Fetching PR #${number}...` })
    getPR(repo, number).then((pr) => {
      if (pr) {
        dispatch({ type: "SET_PRS", prs: [pr, ...prs] })
        dispatch({ type: "SHOW_MESSAGE", message: `Loaded PR #${number}` })
        
        // Record as viewed (spec 015)
        const newHistory = recordPRView(history, {
          repo: getRepoName(pr),
          number: pr.number,
          title: pr.title,
          author: pr.author.login,
        })
        setHistory(newHistory)
        saveHistory(newHistory)
      } else {
        dispatch({ type: "SHOW_MESSAGE", message: `PR #${number} not found` })
      }
    })
  }, [filter.prRef?.repo, filter.prRef?.number])

  // Fetch PRs on-demand when filtering by a repo not in current PR list (spec 018)
  useEffect(() => {
    if (filter.repos.length === 0) return

    // Get repos we're filtering for
    const filterRepos = filter.repos

    // Check which filter repos we don't have PRs for
    const loadedRepos = new Set(prs.map((pr) => getRepoName(pr).toLowerCase()))
    const enabledConfigRepos = new Set(
      config.repositories.filter((r) => !r.disabled).map((r) => r.name.toLowerCase())
    )

    // Find repos that match filter but aren't loaded and aren't enabled in config
    const reposToFetch: string[] = []
    for (const filterRepo of filterRepos) {
      // Check if any loaded repo matches this filter
      const hasLoaded = [...loadedRepos].some((r) => r.includes(filterRepo))
      if (hasLoaded) continue

      // Find full repo name from config (disabled) or visited repos
      const configRepo = config.repositories.find(
        (r) => r.disabled && r.name.toLowerCase().includes(filterRepo)
      )
      if (configRepo) {
        reposToFetch.push(configRepo.name)
        continue
      }

      // Check visited repos
      const visitedRepo = (history.visitedRepos ?? []).find(
        (r) => r.name.toLowerCase().includes(filterRepo)
      )
      if (visitedRepo) {
        reposToFetch.push(visitedRepo.name)
      }
    }

    if (reposToFetch.length === 0) return

    dispatch({ type: "SHOW_MESSAGE", message: `Loading ${reposToFetch.join(", ")}...` })
    listPRsFromRepos(reposToFetch).then((fetchedPRs) => {
      if (fetchedPRs.length > 0) {
        // Merge with existing PRs (avoid duplicates)
        const existingKeys = new Set(prs.map((pr) => `${getRepoName(pr)}#${pr.number}`))
        const newPRs = fetchedPRs.filter(
          (pr) => !existingKeys.has(`${getRepoName(pr)}#${pr.number}`)
        )
        if (newPRs.length > 0) {
          dispatch({ type: "SET_PRS", prs: [...prs, ...newPRs] })
        }
        dispatch({ type: "SHOW_MESSAGE", message: `Loaded ${fetchedPRs.length} PRs` })
      } else {
        dispatch({ type: "SHOW_MESSAGE", message: "No open PRs found" })
      }
    }).catch(() => {
      dispatch({ type: "SHOW_MESSAGE", message: "Failed to load PRs" })
    })
  }, [filter.repos.join(",")])

  return { fetchPRs }
}
