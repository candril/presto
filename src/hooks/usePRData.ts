/**
 * Hook for PR data fetching and caching
 * Handles initial load, refresh, and on-demand PR fetching
 */

import { useEffect, useCallback, useRef } from "react"
import { listPRs, listPRsFromRepos, getPR, getPRsBulk, listClosedPRs, listMergedPRs, listPRsByAuthor } from "../providers/github"
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

/**
 * Find marked PRs that are missing from the loaded set.
 * This catches marked PRs from configured repos that have been closed/merged
 * (and thus aren't in the initial open-only fetch).
 */
function getMissingMarkedPRs(
  loadedPRs: PR[],
  history: History
): Array<{ repo: string; number: number }> {
  const loadedKeys = new Set(
    loadedPRs.map((pr) => `${getRepoName(pr)}#${pr.number}`)
  )

  const missing: Array<{ repo: string; number: number }> = []
  for (const key of history.markedPRs ?? []) {
    if (loadedKeys.has(key)) continue
    const match = key.match(/^(.+)#(\d+)$/)
    if (!match) continue
    missing.push({ repo: match[1], number: parseInt(match[2], 10) })
  }
  return missing
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

  /**
   * Get repos that match the current filter (if any repo filter is active).
   * Returns repos that should be prioritized during refresh.
   * Priority repos include both configured AND non-configured repos matching the filter.
   */
  const getPriorityRepos = useCallback((): { priority: string[]; rest: string[] } => {
    const enabledRepos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)

    // If no repo filter, no prioritization
    if (filter.repos.length === 0) {
      return { priority: [], rest: enabledRepos }
    }

    // Find repos matching the filter
    const filterLower = filter.repos.map((r) => r.toLowerCase())
    const priority: string[] = []
    const rest: string[] = []

    for (const repo of enabledRepos) {
      const repoLower = repo.toLowerCase()
      const matches = filterLower.some((f) => repoLower.includes(f))
      if (matches) {
        priority.push(repo)
      } else {
        rest.push(repo)
      }
    }

    // Also check for non-configured repos matching the filter
    // (from disabled config repos or visited repos)
    for (const filterRepo of filter.repos) {
      // Skip if already matched an enabled repo
      if (priority.some((r) => r.toLowerCase().includes(filterRepo))) continue

      // Check disabled config repos
      const disabledRepo = config.repositories.find(
        (r) => r.disabled && r.name.toLowerCase().includes(filterRepo)
      )
      if (disabledRepo) {
        priority.push(disabledRepo.name)
        continue
      }

      // Check visited repos
      const visitedRepo = (history.visitedRepos ?? []).find(
        (r) => r.name.toLowerCase().includes(filterRepo)
      )
      if (visitedRepo) {
        priority.push(visitedRepo.name)
      }
    }

    return { priority, rest }
  }, [config.repositories, filter.repos, history.visitedRepos])

  // Fetch PRs from GitHub
  // When repo filter is active: fetch filtered repos first, then background load the rest
  const fetchPRs = useCallback(async (showAsRefresh = false) => {
    const allEnabledRepos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)

    if (showAsRefresh) {
      dispatch({ type: "SET_REFRESHING", refreshing: true })
    } else {
      dispatch({ type: "SET_LOADING", loading: true })
    }

    // Clear preview cache on refresh
    dispatch({ type: "CLEAR_PREVIEW_CACHE" })

    try {
      const { priority, rest } = getPriorityRepos()
      
      // If we have priority repos (matching current filter), fetch those first
      if (priority.length > 0) {
        const priorityPRs = await listPRsFromRepos(priority)
        
        // Dispatch priority PRs immediately for fast UI update
        dispatch({ type: "SET_PRS", prs: priorityPRs })
        dispatch({ type: "SET_LAST_REFRESH", time: new Date() })
        
        // Background load: rest of configured repos + tracked PRs + missing marked PRs
        // Don't await - let it run in background
        const hasBackgroundWork = rest.length > 0 
          || getTrackedPRsFromNonConfiguredRepos().length > 0
          || (history.markedPRs ?? []).length > 0
        if (hasBackgroundWork) {
          (async () => {
            let backgroundPRs = [...priorityPRs]
            
            // Fetch rest of configured repos
            if (rest.length > 0) {
              const restPRs = await listPRsFromRepos(rest)
              const existingKeys = new Set(backgroundPRs.map((pr) => `${getRepoName(pr)}#${pr.number}`))
              const newPRs = restPRs.filter(
                (pr) => !existingKeys.has(`${getRepoName(pr)}#${pr.number}`)
              )
              backgroundPRs = [...backgroundPRs, ...newPRs]
            }
            
            // Fetch tracked PRs for notification detection
            const trackedFromOtherRepos = getTrackedPRsFromNonConfiguredRepos()
            if (trackedFromOtherRepos.length > 0) {
              const trackedPRs = await getPRsBulk(trackedFromOtherRepos)
              const existingKeys = new Set(backgroundPRs.map((pr) => `${getRepoName(pr)}#${pr.number}`))
              const newTracked = trackedPRs.filter(
                (pr) => !existingKeys.has(`${getRepoName(pr)}#${pr.number}`)
              )
              backgroundPRs = [...backgroundPRs, ...newTracked]
            }
            
            // Fetch marked PRs that are missing (e.g. closed/merged PRs from configured repos)
            const missingMarked = getMissingMarkedPRs(backgroundPRs, history)
            if (missingMarked.length > 0) {
              const markedPRs = await getPRsBulk(missingMarked)
              backgroundPRs = [...backgroundPRs, ...markedPRs]
            }
            
            // Update with full data
            dispatch({ type: "SET_PRS", prs: backgroundPRs })
            saveCache(backgroundPRs.filter(pr => {
              const repoName = getRepoName(pr).toLowerCase()
              return allEnabledRepos.some(r => r.toLowerCase() === repoName)
            }), allEnabledRepos)
          })()
        } else {
          // No background work needed, cache priority repos
          saveCache(priorityPRs.filter(pr => {
            const repoName = getRepoName(pr).toLowerCase()
            return allEnabledRepos.some(r => r.toLowerCase() === repoName)
          }), allEnabledRepos)
        }
      } else {
        // No priority repos, fetch all at once
        let allFetchedPRs = await listPRsFromRepos(allEnabledRepos)

        // Fetch tracked PRs for notification detection
        const trackedFromOtherRepos = getTrackedPRsFromNonConfiguredRepos()
        if (trackedFromOtherRepos.length > 0) {
          const trackedPRs = await getPRsBulk(trackedFromOtherRepos)
          const existingKeys = new Set(allFetchedPRs.map((pr) => `${getRepoName(pr)}#${pr.number}`))
          const newTracked = trackedPRs.filter(
            (pr) => !existingKeys.has(`${getRepoName(pr)}#${pr.number}`)
          )
          allFetchedPRs = [...allFetchedPRs, ...newTracked]
        }

        // Fetch marked PRs that are missing (e.g. closed/merged PRs from configured repos)
        const missingMarked = getMissingMarkedPRs(allFetchedPRs, history)
        if (missingMarked.length > 0) {
          const markedPRs = await getPRsBulk(missingMarked)
          allFetchedPRs = [...allFetchedPRs, ...markedPRs]
        }

        dispatch({ type: "SET_PRS", prs: allFetchedPRs })
        dispatch({ type: "SET_LAST_REFRESH", time: new Date() })
        saveCache(allFetchedPRs.filter(pr => {
          const repoName = getRepoName(pr).toLowerCase()
          return allEnabledRepos.some(r => r.toLowerCase() === repoName)
        }), allEnabledRepos)
      }
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
  }, [config.repositories, dispatch, getTrackedPRsFromNonConfiguredRepos, getPriorityRepos])

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

  // Track which repos have been fully fetched (not just individual PRs)
  const fullyFetchedRepos = useRef<Set<string>>(new Set())

  // Fetch PRs on-demand when filtering by a repo not in current PR list (spec 018)
  useEffect(() => {
    if (filter.repos.length === 0) return

    // Get repos we're filtering for
    const filterRepos = filter.repos

    // Enabled repos are always fully loaded, skip those
    const enabledConfigRepos = new Set(
      config.repositories.filter((r) => !r.disabled).map((r) => r.name.toLowerCase())
    )

    // Find repos that match filter and need fetching
    const reposToFetch: string[] = []
    for (const filterRepo of filterRepos) {
      // Skip if this is an enabled config repo (already fully loaded)
      const isEnabledRepo = [...enabledConfigRepos].some((r) => r.includes(filterRepo))
      if (isEnabledRepo) continue

      // Skip if we already fully fetched this repo
      const alreadyFetched = [...fullyFetchedRepos.current].some((r) => r.includes(filterRepo))
      if (alreadyFetched) continue

      // Find full repo name from config (disabled) or visited repos
      let fullRepoName: string | null = null
      
      const configRepo = config.repositories.find(
        (r) => r.disabled && r.name.toLowerCase().includes(filterRepo)
      )
      if (configRepo) {
        fullRepoName = configRepo.name
      } else {
        // Check visited repos
        const visitedRepo = (history.visitedRepos ?? []).find(
          (r) => r.name.toLowerCase().includes(filterRepo)
        )
        if (visitedRepo) {
          fullRepoName = visitedRepo.name
        }
      }

      if (fullRepoName) {
        reposToFetch.push(fullRepoName)
      }
    }

    if (reposToFetch.length === 0) return

    dispatch({ type: "SHOW_MESSAGE", message: `Loading ${reposToFetch.join(", ")}...` })
    listPRsFromRepos(reposToFetch).then((fetchedPRs) => {
      // Mark repos as fully fetched
      for (const repo of reposToFetch) {
        fullyFetchedRepos.current.add(repo.toLowerCase())
      }
      
      if (fetchedPRs.length > 0) {
        // Use APPEND_PRS to merge with existing PRs (handles deduplication)
        dispatch({ type: "APPEND_PRS", prs: fetchedPRs })
        dispatch({ type: "SHOW_MESSAGE", message: `Loaded ${fetchedPRs.length} PRs` })
      } else {
        dispatch({ type: "SHOW_MESSAGE", message: "No open PRs found" })
      }
    }).catch(() => {
      dispatch({ type: "SHOW_MESSAGE", message: "Failed to load PRs" })
    })
  }, [filter.repos.join(",")])

  // Track which repos have had closed/merged PRs fetched
  // Cache key includes author to re-fetch when author filter changes
  const fetchedClosedRepos = useRef<Set<string>>(new Set())
  const fetchedMergedRepos = useRef<Set<string>>(new Set())
  const closedMergedDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Fetch closed/merged PRs when state:closed or state:merged filter is active
  useEffect(() => {
    const wantsClosed = filter.states.includes("closed")
    const wantsMerged = filter.states.includes("merged")
    
    if (!wantsClosed && !wantsMerged) return

    // Clear previous debounce timer
    if (closedMergedDebounceRef.current) {
      clearTimeout(closedMergedDebounceRef.current)
    }

    closedMergedDebounceRef.current = setTimeout(() => {
      // Get repos to fetch from - either filtered repos or enabled repos
      const enabledRepos = config.repositories
        .filter((r) => !r.disabled)
        .map((r) => r.name)
      
      // If repo filter is active, only fetch those repos
      let reposToCheck = enabledRepos
      if (filter.repos.length > 0) {
        reposToCheck = enabledRepos.filter((repo) =>
          filter.repos.some((f) => repo.toLowerCase().includes(f))
        )
      }

      // Include author in cache key so we re-fetch when author filter changes
      const author = filter.authors.length > 0 ? filter.authors[0] : undefined
      const cacheKeySuffix = author ? `@${author}` : ""

      const fetchPromises: Promise<PR[]>[] = []

      // Fetch closed PRs if needed
      if (wantsClosed) {
        for (const repo of reposToCheck) {
          const cacheKey = `${repo.toLowerCase()}${cacheKeySuffix}`
          if (fetchedClosedRepos.current.has(cacheKey)) continue
          fetchedClosedRepos.current.add(cacheKey)
          fetchPromises.push(listClosedPRs(repo, { author }).catch(() => []))
        }
      }

      // Fetch merged PRs if needed
      if (wantsMerged) {
        for (const repo of reposToCheck) {
          const cacheKey = `${repo.toLowerCase()}${cacheKeySuffix}`
          if (fetchedMergedRepos.current.has(cacheKey)) continue
          fetchedMergedRepos.current.add(cacheKey)
          fetchPromises.push(listMergedPRs(repo, { author }).catch(() => []))
        }
      }

      if (fetchPromises.length > 0) {
        const stateLabel = wantsMerged ? "merged" : "closed"
        dispatch({ type: "SET_REFRESHING", refreshing: true })
        dispatch({ type: "SHOW_MESSAGE", message: `Loading ${stateLabel} PRs${author ? ` by @${author}` : ""}...` })
        
        Promise.all(fetchPromises).then((results) => {
          const allPRs = results.flat()
          if (allPRs.length > 0) {
            dispatch({ type: "APPEND_PRS", prs: allPRs })
            dispatch({ type: "SHOW_MESSAGE", message: `Found ${allPRs.length} ${stateLabel} PR${allPRs.length === 1 ? "" : "s"}` })
          } else {
            dispatch({ type: "CLEAR_MESSAGE" })
          }
          dispatch({ type: "SET_REFRESHING", refreshing: false })
        })
      }
    }, 300)

    return () => {
      if (closedMergedDebounceRef.current) {
        clearTimeout(closedMergedDebounceRef.current)
      }
    }
  }, [filter.states.join(","), filter.repos.join(","), filter.authors.join(","), config.repositories])

  // Track which author+repo combos have been fetched for @user background fetch
  const fetchedAuthorRepos = useRef<Map<string, Set<string>>>(new Map())
  const authorDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Background fetch for @user filter
  useEffect(() => {
    if (filter.authors.length === 0) return

    // Clear previous debounce timer
    if (authorDebounceRef.current) {
      clearTimeout(authorDebounceRef.current)
    }

    authorDebounceRef.current = setTimeout(() => {
      const author = filter.authors[0] // Primary author filter
      const enabledRepos = config.repositories
        .filter((r) => !r.disabled)
        .map((r) => r.name)
      
      // Determine repos to fetch (respect repo: filter if present)
      let reposToCheck = enabledRepos
      if (filter.repos.length > 0) {
        reposToCheck = enabledRepos.filter((repo) =>
          filter.repos.some((f) => repo.toLowerCase().includes(f))
        )
      }
      
      // Skip repos already fetched for this author
      const fetched = fetchedAuthorRepos.current.get(author) ?? new Set()
      const reposToFetch = reposToCheck.filter(r => !fetched.has(r.toLowerCase()))
      
      if (reposToFetch.length === 0) return

      // Determine what state to fetch based on state: filter
      const state = filter.states.includes("merged") ? "merged" as const
        : filter.states.includes("closed") ? "closed" as const
        : "all" as const
      
      dispatch({ type: "SET_REFRESHING", refreshing: true })
      dispatch({ type: "SHOW_MESSAGE", message: `Loading PRs by @${author}...` })
      
      Promise.all(
        reposToFetch.map(repo => 
          listPRsByAuthor(repo, author, state).catch(() => [])
        )
      ).then((results) => {
        // Mark repos as fetched for this author
        const newFetched = new Set(fetched)
        for (const repo of reposToFetch) {
          newFetched.add(repo.toLowerCase())
        }
        fetchedAuthorRepos.current.set(author, newFetched)
        
        const allPRs = results.flat()
        if (allPRs.length > 0) {
          dispatch({ type: "APPEND_PRS", prs: allPRs })
          dispatch({ type: "SHOW_MESSAGE", message: `Found ${allPRs.length} PR${allPRs.length === 1 ? "" : "s"} by @${author}` })
        } else {
          dispatch({ type: "CLEAR_MESSAGE" })
        }
        dispatch({ type: "SET_REFRESHING", refreshing: false })
      })
    }, 300)

    return () => {
      if (authorDebounceRef.current) {
        clearTimeout(authorDebounceRef.current)
      }
    }
  }, [filter.authors.join(","), filter.repos.join(","), filter.states.join(","), config.repositories])

  return { fetchPRs }
}
