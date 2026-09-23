/**
 * Hook for PR data fetching and caching
 * Handles initial load, refresh, and on-demand PR fetching
 */

import { useEffect, useCallback, useRef, useState } from "react"
import { listPRs, listPRsFromRepos, getPR, getPRsBulk, listClosedPRs, listMergedPRs, listPRsByAuthor } from "../providers"
import { saveCache } from "../cache"
import { recordPRView, recordRepoVisit, saveHistory, type History } from "../history"
import type { Config } from "../config"
import type { PR } from "../types"
import { getRepoName } from "../types"
import type { AppAction } from "../state"
import type { ParsedFilter } from "../discovery"
import { claimAuthorFetch, planAuthorFetches, releaseAuthorFetch } from "../discovery/authorFetch"

/** One repo's closed-or-merged query, with the claim that keeps it from being fired twice */
interface RepoFetch {
  cacheKey: string
  claimed: Set<string>
  list: () => Promise<PR[]>
}

/** Names the states a closed/merged fetch covers, for user-facing text */
export function describeClosedMergedStates(wantsClosed: boolean, wantsMerged: boolean): string {
  if (wantsClosed && wantsMerged) return "closed and merged"
  return wantsMerged ? "merged" : "closed"
}

interface UsePRDataOptions {
  config: Config
  filter: ParsedFilter
  prs: PR[]
  dispatch: (action: AppAction) => void
  history: History
  setHistory: (history: History) => void
  currentUser: string | null
}

/**
 * Find marked PRs that are missing from the loaded set.
 * This catches marked PRs from configured repos that have been closed/merged
 * (and thus aren't in the initial open-only fetch).
 */
/**
 * Keep the PRs we already have for repos whose fetch failed, so a transient
 * GitHub error neither blanks the list nor lets the follow-up cache write
 * persist that blank.
 */
export function retainPRsFromRepos(current: PR[], fetched: PR[], repos: string[]): PR[] {
  if (repos.length === 0) return fetched

  const retain = new Set(repos.map((r) => r.toLowerCase()))
  const fetchedKeys = new Set(fetched.map((pr) => `${getRepoName(pr)}#${pr.number}`))
  const retained = current.filter(
    (pr) =>
      retain.has(getRepoName(pr).toLowerCase()) &&
      !fetchedKeys.has(`${getRepoName(pr)}#${pr.number}`)
  )
  return [...fetched, ...retained]
}

/**
 * The list with `repos`' PRs swapped for `fetched` and every other repo's left as held.
 * A refresh narrowed to one tab's repos must not take the rest of the list with it: the
 * other tabs read from the same list, and the background half that restores them can
 * fail or be overtaken.
 */
export function replaceReposPRs(current: PR[], fetched: PR[], repos: string[]): PR[] {
  const replacing = new Set(repos.map((r) => r.toLowerCase()))
  return [...fetched, ...current.filter((pr) => !replacing.has(getRepoName(pr).toLowerCase()))]
}

/**
 * Whether a `repo:` filter term names this repo. A full owner/name must match exactly —
 * `acme/api` is not `acme/api-gateway`, and treating it as such would skip fetching the
 * repo that was asked for — while a bare fragment matches anywhere in the name.
 */
export function filterNamesRepo(filterRepo: string, repo: string): boolean {
  const name = repo.toLowerCase()
  return filterRepo.includes("/") ? name === filterRepo : name.includes(filterRepo)
}

function describeFailedRepos(failedRepos: string[]): string {
  const names = failedRepos.slice(0, 3).join(", ")
  const more = failedRepos.length > 3 ? ` +${failedRepos.length - 3} more` : ""
  return `Could not refresh ${names}${more} — showing cached PRs`
}

function getMissingMarkedPRs(
  loadedPRs: PR[],
  history: History
): Array<{ repo: string; number: number }> {
  const loadedKeys = new Set(
    loadedPRs.map((pr) => `${getRepoName(pr)}#${pr.number}`)
  )

  const missing: Array<{ repo: string; number: number }> = []
  for (const key of Object.keys(history.markedPRs ?? {})) {
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
      ...Object.keys(history.markedPRs ?? {}),
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
      if (filterLower.some((f) => filterNamesRepo(f, repo))) {
        priority.push(repo)
      } else {
        rest.push(repo)
      }
    }

    // Also check for non-configured repos matching the filter
    // (from disabled config repos or visited repos)
    for (const filterRepo of filter.repos) {
      // Skip if already matched an enabled repo
      if (priority.some((r) => filterNamesRepo(filterRepo, r))) continue

      // Check disabled config repos
      const disabledRepo = config.repositories.find(
        (r) => r.disabled && filterNamesRepo(filterRepo, r.name)
      )
      if (disabledRepo) {
        priority.push(disabledRepo.name)
        continue
      }

      // Check visited repos
      const visitedRepo = (history.visitedRepos ?? []).find(
        (r) => filterNamesRepo(filterRepo, r.name)
      )
      if (visitedRepo) {
        priority.push(visitedRepo.name)
        continue
      }

      // Ad-hoc repo: if filter looks like owner/repo, treat as direct repo name
      if (filterRepo.includes("/")) {
        const parts = filterRepo.split("/")
        if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
          priority.push(filterRepo)
        }
      }
    }

    return { priority, rest }
  }, [config.repositories, filter.repos, history.visitedRepos])

  // Background fetch cache refs - declared before fetchPRs so it can clear them on refresh
  const fullyFetchedRepos = useRef<Set<string>>(new Set())
  const fetchedClosedRepos = useRef<Set<string>>(new Set())
  const fetchedMergedRepos = useRef<Set<string>>(new Set())
  const closedMergedDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closedMergedInFlight = useRef(0)
  // What the closed/merged backfill has found, keyed by URL. A refresh replaces the whole
  // list with open PRs, and these are in none of them.
  const closedMergedPRs = useRef<Map<string, PR>>(new Map())

  const fetchedAuthorRepos = useRef<Map<string, Set<string>>>(new Map())
  const authorDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const authorInFlight = useRef(0)
  // The author backfill's last answer per `author|repo`. Held so the rows survive the
  // `SET_PRS` of a refresh — re-asking takes a `gh` round trip per repo, and the tab
  // would be empty until it lands. A later answer replaces the slice, so a PR that has
  // since merged is removed rather than restored for ever.
  const authorSlices = useRef<Map<string, PR[]>>(new Map())
  const authorEpoch = useRef(0)
  // The last answer per repo outside the enabled config (disabled, visited, ad-hoc), keyed
  // lowercase. A refresh rebuilds the list from enabled repos only, and without these a
  // `repo:` tab on such a repo would be empty until its own fetch came back.
  const outsideRepoPRs = useRef<Map<string, PR[]>>(new Map())

  /**
   * Record what a fetch said about repos outside the enabled config, and drop whatever
   * the previous answer held that this one no longer does: merged or closed since.
   */
  const rememberOutsideRepoPRs = useCallback((repos: string[], prs: PR[]) => {
    const enabled = new Set(
      config.repositories.filter((r) => !r.disabled).map((r) => r.name.toLowerCase())
    )
    const gone: string[] = []
    for (const repo of repos) {
      const key = repo.toLowerCase()
      if (enabled.has(key)) continue
      const slice = prs.filter((pr) => getRepoName(pr).toLowerCase() === key)
      const fresh = new Set(slice.map((pr) => pr.url))
      for (const pr of outsideRepoPRs.current.get(key) ?? []) {
        if (!fresh.has(pr.url)) gone.push(pr.url)
      }
      outsideRepoPRs.current.set(key, slice)
    }
    if (gone.length > 0) dispatch({ type: "REMOVE_PRS", urls: gone })
  }, [config.repositories, dispatch])

  /**
   * Put the backfilled closed/merged PRs back after `SET_PRS` has replaced the list.
   * A refresh re-queries them too, but that is a `gh` round trip per repo, and until it
   * lands a state:merged filter would be looking at an empty list.
   *
   * The author backfill's rows and those of repos outside the config come back too. They
   * are only as fresh as the last answer, which is why re-asking replaces the whole slice
   * and drops what is no longer in it.
   */
  const restoreBackfilledPRs = useCallback(() => {
    const known = [
      ...closedMergedPRs.current.values(),
      ...[...authorSlices.current.values()].flat(),
      ...[...outsideRepoPRs.current.values()].flat(),
    ]
    if (known.length > 0) dispatch({ type: "APPEND_PRS", prs: known })
  }, [dispatch])

  // Epoch counter to re-trigger background fetch effects after a refresh
  // (refs are cleared but effects need a dep change to re-run)
  const [refreshEpoch, setRefreshEpoch] = useState(0)

  // fetchPRs is memoized without `prs`; a ref keeps the retain-on-failure logic
  // working against the currently displayed list rather than a stale closure.
  const prsRef = useRef(prs)
  prsRef.current = prs
  // Every async path reads history once its fetch lands; the render it started in may
  // hold a copy that has since gained snapshots, marks or visits
  const historyRef = useRef(history)
  historyRef.current = history

  // Fetch PRs from GitHub
  // When repo filter is active: fetch filtered repos first, then background load the rest
  const fetchPRs = useCallback(async (showAsRefresh = false, force = false) => {
    const allEnabledRepos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)

    if (showAsRefresh) {
      dispatch({ type: "SET_REFRESHING", refreshing: true })
    } else {
      dispatch({ type: "SET_LOADING", loading: true })
    }

    // Clear preview cache and background fetch caches on refresh
    // This ensures state:merged/closed effects re-fetch after SET_PRS replaces all PRs
    dispatch({ type: "CLEAR_PREVIEW_CACHE" })
    fetchedClosedRepos.current.clear()
    fetchedMergedRepos.current.clear()
    fullyFetchedRepos.current.clear()

    try {
      const { priority, rest } = getPriorityRepos()
      
      // If we have priority repos (matching current filter), fetch those first
      if (priority.length > 0) {
        const priorityResult = await listPRsFromRepos(priority, { force })
        if (priorityResult.failedRepos.length === priority.length) {
          throw new Error(`Failed to fetch ${priority.join(", ")}`)
        }
        const priorityPRs = retainPRsFromRepos(
          prsRef.current,
          priorityResult.prs,
          priorityResult.failedRepos
        )
        if (priorityResult.failedRepos.length > 0) {
          dispatch({ type: "SHOW_MESSAGE", message: describeFailedRepos(priorityResult.failedRepos) })
        }

        // Mark priority repos as fully fetched so the repo: filter effect doesn't re-fetch
        // (failed ones stay unmarked so the repo: filter effect can retry them)
        for (const repo of priority) {
          if (priorityResult.failedRepos.includes(repo)) continue
          fullyFetchedRepos.current.add(repo.toLowerCase())
        }
        rememberOutsideRepoPRs(
          priority.filter((repo) => !priorityResult.failedRepos.includes(repo)),
          priorityResult.prs
        )

        // Record ad-hoc priority repos as visited
        const configRepoNames = new Set(config.repositories.map((r) => r.name.toLowerCase()))
        const visitedRepoNames = new Set((history.visitedRepos ?? []).map((r) => r.name.toLowerCase()))
        let updatedHistory = history
        let historyChanged = false
        for (const repo of priority) {
          const repoLower = repo.toLowerCase()
          if (!configRepoNames.has(repoLower) && !visitedRepoNames.has(repoLower)) {
            updatedHistory = recordRepoVisit(updatedHistory, repo)
            historyChanged = true
          }
        }
        if (historyChanged) {
          setHistory(updatedHistory)
          saveHistory(updatedHistory)
        }
        
        // Dispatch priority PRs immediately for fast UI update
        dispatch({ type: "SET_PRS", prs: replaceReposPRs(prsRef.current, priorityPRs, priority) })
        restoreBackfilledPRs()
        dispatch({ type: "SET_LAST_REFRESH", time: new Date() })
        
        // Rest of configured repos + tracked PRs + missing marked PRs. Awaited, though the
        // priority PRs are already on screen, so the caller's in-flight guard covers the
        // whole refresh and a second one cannot start underneath it.
        const hasBackgroundWork = rest.length > 0 
          || getTrackedPRsFromNonConfiguredRepos().length > 0
          || Object.keys(history.markedPRs ?? {}).length > 0
        if (hasBackgroundWork) {
          await (async () => {
            try {
              let backgroundPRs = [...priorityPRs]

              // Fetch rest of configured repos
              if (rest.length > 0) {
                const restResult = await listPRsFromRepos(rest, { force })
                if (restResult.failedRepos.length === rest.length) {
                  throw new Error(`Failed to fetch ${rest.join(", ")}`)
                }
                const restPRs = retainPRsFromRepos(
                  prsRef.current,
                  restResult.prs,
                  restResult.failedRepos
                )
                if (restResult.failedRepos.length > 0) {
                  dispatch({ type: "SHOW_MESSAGE", message: describeFailedRepos(restResult.failedRepos) })
                }
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

              // Update with full data, then bump epoch to re-trigger background effects
              dispatch({ type: "SET_PRS", prs: backgroundPRs })
              restoreBackfilledPRs()
              setRefreshEpoch(e => e + 1)
              saveCache(backgroundPRs.filter(pr => {
                const repoName = getRepoName(pr).toLowerCase()
                return allEnabledRepos.some(r => r.toLowerCase() === repoName)
              }), allEnabledRepos)
            } catch (err) {
              // Background fetch failed — keep already-shown priority PRs, don't overwrite cache
              dispatch({ type: "SHOW_MESSAGE", message: "Background refresh failed (offline?)" })
            }
          })()
        } else {
          // No background work needed, cache priority repos
          saveCache(priorityPRs.filter(pr => {
            const repoName = getRepoName(pr).toLowerCase()
            return allEnabledRepos.some(r => r.toLowerCase() === repoName)
          }), allEnabledRepos)
          // Bump epoch so background fetch effects re-run (caches were cleared above)
          setRefreshEpoch(e => e + 1)
        }
      } else {
        // No priority repos, fetch all at once
        const allResult = await listPRsFromRepos(allEnabledRepos, { force })
        if (allEnabledRepos.length > 0 && allResult.failedRepos.length === allEnabledRepos.length) {
          throw new Error(`Failed to fetch ${allEnabledRepos.join(", ")}`)
        }
        let allFetchedPRs = retainPRsFromRepos(
          prsRef.current,
          allResult.prs,
          allResult.failedRepos
        )
        if (allResult.failedRepos.length > 0) {
          dispatch({ type: "SHOW_MESSAGE", message: describeFailedRepos(allResult.failedRepos) })
        }

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
        restoreBackfilledPRs()
        dispatch({ type: "SET_LAST_REFRESH", time: new Date() })
        // Bump epoch so background fetch effects re-run (caches were cleared above)
        setRefreshEpoch(e => e + 1)
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
      } else {
        // Refresh failed but we still have cached PRs visible — let the user know
        // the list they're seeing is stale rather than silently doing nothing.
        dispatch({ type: "SHOW_MESSAGE", message: "Refresh failed (offline?) — showing cached PRs" })
      }
    }
  }, [config.repositories, dispatch, getTrackedPRsFromNonConfiguredRepos, getPriorityRepos, restoreBackfilledPRs, rememberOutsideRepoPRs])

  // Revalidate on mount - PRs are already hydrated from cache in createInitialState()
  // so always do a background refresh (stale data shows immediately)
  useEffect(() => {
    const hasPRs = prs.length > 0
    fetchPRs(hasPRs)
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
  const repoFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (filter.repos.length === 0) return

    // Enabled repos are always fully loaded, skip those
    const enabledConfigRepos = config.repositories.filter((r) => !r.disabled).map((r) => r.name)

    // Find repos that match filter and need fetching
    const reposToFetch: string[] = []
    const adHocRepos: string[] = []
    for (const filterRepo of filter.repos) {
      if (enabledConfigRepos.some((r) => filterNamesRepo(filterRepo, r))) continue
      if ([...fullyFetchedRepos.current].some((r) => filterNamesRepo(filterRepo, r))) continue

      // Find full repo name from config (disabled) or visited repos
      let fullRepoName: string | null = null
      let isAdHoc = false

      const configRepo = config.repositories.find(
        (r) => r.disabled && filterNamesRepo(filterRepo, r.name)
      )
      if (configRepo) {
        fullRepoName = configRepo.name
      } else {
        const visitedRepo = (historyRef.current.visitedRepos ?? []).find(
          (r) => filterNamesRepo(filterRepo, r.name)
        )
        if (visitedRepo) {
          fullRepoName = visitedRepo.name
        }
      }

      // Ad-hoc repo: if filter looks like owner/repo but isn't configured or visited,
      // treat it as a direct repo name and try fetching from GitHub
      if (!fullRepoName && filterRepo.includes("/")) {
        const parts = filterRepo.split("/")
        if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
          fullRepoName = filterRepo
          isAdHoc = true
        }
      }

      if (fullRepoName) {
        reposToFetch.push(fullRepoName)
        if (isAdHoc) adHocRepos.push(fullRepoName)
      }
    }

    if (reposToFetch.length === 0) return

    // The filter follows every keystroke, and each half-typed owner/name would otherwise
    // be looked up — a GraphQL miss plus a `gh` fallback apiece, for repos that do not exist
    repoFilterDebounceRef.current = setTimeout(() => {
      repoFilterDebounceRef.current = undefined
      dispatch({ type: "SHOW_MESSAGE", message: `Loading ${reposToFetch.join(", ")}...` })
      listPRsFromRepos(reposToFetch).then(({ prs: fetchedPRs, failedRepos }) => {
        if (failedRepos.length === reposToFetch.length) {
          dispatch({ type: "SHOW_MESSAGE", message: describeFailedRepos(failedRepos) })
          return
        }

        // Mark repos as fully fetched (failed ones stay unmarked so they can be retried)
        for (const repo of reposToFetch) {
          if (failedRepos.includes(repo)) continue
          fullyFetchedRepos.current.add(repo.toLowerCase())
        }
        rememberOutsideRepoPRs(
          reposToFetch.filter((repo) => !failedRepos.includes(repo)),
          fetchedPRs
        )

        // Record ad-hoc repos as visited so they appear in suggestions next time
        const visited = adHocRepos.filter((repo) => !failedRepos.includes(repo))
        if (visited.length > 0) {
          let newHistory = historyRef.current
          for (const repo of visited) {
            newHistory = recordRepoVisit(newHistory, repo)
          }
          setHistory(newHistory)
          saveHistory(newHistory)
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
    }, 300)

    return () => {
      clearTimeout(repoFilterDebounceRef.current)
      repoFilterDebounceRef.current = undefined
    }
  }, [filter.repos.join(","), refreshEpoch])

  // Fetch closed/merged PRs when state:closed or state:merged filter is active
  useEffect(() => {
    const wantsClosed = filter.states.includes("closed")
    const wantsMerged = filter.states.includes("merged")

    if (!wantsClosed && !wantsMerged) return

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

    const planned: RepoFetch[] = []
    const planFetches = (claimed: Set<string>, list: (repo: string) => Promise<PR[]>) => {
      for (const repo of reposToCheck) {
        const cacheKey = `${repo.toLowerCase()}${cacheKeySuffix}`
        if (claimed.has(cacheKey)) continue
        planned.push({ cacheKey, claimed, list: () => list(repo) })
      }
    }
    if (wantsClosed) {
      planFetches(fetchedClosedRepos.current, (repo) => listClosedPRs(repo, { author }))
    }
    if (wantsMerged) {
      planFetches(fetchedMergedRepos.current, (repo) => listMergedPRs(repo, { author }))
    }

    if (planned.length === 0) return

    // Announce the fetch before the debounce, not after it: these PRs are never in the
    // open-PR list, so until the first repo answers the list is empty and would otherwise
    // read as "nothing matched" for the debounce plus a full `gh` round trip.
    dispatch({ type: "SET_CLOSED_MERGED_LOADING", loading: true })

    if (closedMergedDebounceRef.current) {
      clearTimeout(closedMergedDebounceRef.current)
    }

    closedMergedDebounceRef.current = setTimeout(() => {
      closedMergedDebounceRef.current = undefined

      // Re-check the claims: this run planned against the sets as they were 300ms ago
      const starting = planned.filter(({ cacheKey, claimed }) => {
        if (claimed.has(cacheKey)) return false
        claimed.add(cacheKey)
        return true
      })

      if (starting.length === 0) {
        if (closedMergedInFlight.current === 0) {
          dispatch({ type: "SET_CLOSED_MERGED_LOADING", loading: false })
        }
        return
      }

      closedMergedInFlight.current += starting.length
      dispatch({ type: "SET_REFRESHING", refreshing: true })

      let failed = 0
      for (const { cacheKey, claimed, list } of starting) {
        list()
          .then((prs) => {
            if (prs.length === 0) return
            for (const pr of prs) closedMergedPRs.current.set(pr.url, pr)
            // Append per repo rather than awaiting them all: one slow repo would
            // otherwise hold back every result behind it
            dispatch({ type: "APPEND_PRS", prs })
          })
          .catch(() => {
            // Release the claim so the next filter change retries this repo instead of
            // leaving its PRs missing until a manual refresh clears the cache
            claimed.delete(cacheKey)
            failed++
          })
          .finally(() => {
            closedMergedInFlight.current--
            if (closedMergedInFlight.current > 0) return
            dispatch({ type: "SET_REFRESHING", refreshing: false })
            dispatch({ type: "SET_CLOSED_MERGED_LOADING", loading: false })
            if (failed === starting.length) {
              const stateLabel = describeClosedMergedStates(wantsClosed, wantsMerged)
              dispatch({ type: "SHOW_MESSAGE", message: `Failed to load ${stateLabel} PRs` })
            }
          })
      }
    }, 300)

    return () => {
      if (!closedMergedDebounceRef.current) return
      clearTimeout(closedMergedDebounceRef.current)
      closedMergedDebounceRef.current = undefined
      if (closedMergedInFlight.current === 0) {
        dispatch({ type: "SET_CLOSED_MERGED_LOADING", loading: false })
      }
    }
  }, [filter.states.join(","), filter.repos.join(","), filter.authors.join(","), config.repositories, refreshEpoch])

  // Fetch an author's open PRs when an `@author` filter is active. The initial load is
  // the 50 most recently updated open PRs per repo; on a busy repo that window is only
  // days wide, so an older PR of theirs is not in the list for the filter to find.
  useEffect(() => {
    // A refresh re-verifies the authors on screen and leaves the rest claimed: every
    // release is a `gh` round trip per repo the next time that tab is opened, and with a
    // tab per person, clearing them all made switching tabs pay for it again and again.
    if (authorEpoch.current !== refreshEpoch) {
      authorEpoch.current = refreshEpoch
      for (const author of filter.authors) {
        fetchedAuthorRepos.current.delete(author.toLowerCase())
      }
    }

    const planned = planAuthorFetches({
      authors: filter.authors,
      states: filter.states,
      repoFilters: filter.repos,
      enabledRepos: config.repositories.filter((r) => !r.disabled).map((r) => r.name),
      allRepos: config.repositories.map((r) => r.name),
      fetched: fetchedAuthorRepos.current,
    })

    if (planned.length === 0) return

    if (authorDebounceRef.current) {
      clearTimeout(authorDebounceRef.current)
    }

    authorDebounceRef.current = setTimeout(() => {
      authorDebounceRef.current = undefined

      // Re-check the claims: this run planned against the map as it was 300ms ago
      const starting = planned.filter(({ author, cacheKey }) => {
        if (fetchedAuthorRepos.current.get(author.toLowerCase())?.has(cacheKey)) return false
        claimAuthorFetch(fetchedAuthorRepos.current, author, cacheKey)
        return true
      })

      if (starting.length === 0) return

      authorInFlight.current += starting.length
      dispatch({ type: "SET_REFRESHING", refreshing: true })

      for (const { author, repo, cacheKey } of starting) {
        const sliceKey = `${author.toLowerCase()}|${cacheKey}`
        listPRsByAuthor(repo, author, "open")
          .then((prs) => {
            const previous = authorSlices.current.get(sliceKey) ?? []
            authorSlices.current.set(sliceKey, prs)

            // What this slice held and no longer does has left the open list — merged,
            // closed, or no longer theirs — so it goes, rather than lingering as a row
            // nothing will correct.
            const fresh = new Set(prs.map((pr) => pr.url))
            const gone = previous.filter((pr) => !fresh.has(pr.url)).map((pr) => pr.url)
            if (gone.length > 0) dispatch({ type: "REMOVE_PRS", urls: gone })

            if (prs.length === 0) return
            // Append per repo rather than awaiting them all: one slow repo would
            // otherwise hold back every result behind it
            dispatch({ type: "APPEND_PRS", prs })
          })
          .catch(() => {
            releaseAuthorFetch(fetchedAuthorRepos.current, author, cacheKey)
          })
          .finally(() => {
            authorInFlight.current--
            if (authorInFlight.current === 0) {
              dispatch({ type: "SET_REFRESHING", refreshing: false })
            }
          })
      }
    }, 300)

    return () => {
      if (!authorDebounceRef.current) return
      clearTimeout(authorDebounceRef.current)
      authorDebounceRef.current = undefined
    }
  }, [filter.authors.join(","), filter.states.join(","), filter.repos.join(","), config.repositories, refreshEpoch])

  return { fetchPRs }
}
