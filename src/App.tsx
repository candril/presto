/**
 * Main application component
 */

import { useReducer, useEffect, useCallback, useState, useMemo } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { PRList } from "./components/PRList"
import { Loading } from "./components/Loading"
import { DiscoverySuggestions } from "./components/DiscoverySuggestions"
import { CommandLine } from "./components/CommandLine"
import { appReducer, initialState } from "./state"
import { listPRs, listPRsFromRepos, listRecentPRsFromRepos, getPR } from "./providers/github"
import { parseFilter, applyFilter, isFilterActive, applyStarredOnlyFilter } from "./discovery"
import {
  loadHistory,
  saveHistory,
  toggleStarAuthor,
  type History,
} from "./history"
import { openInBrowser, openInRiff, copyPRUrl, copyPRNumber } from "./actions"
import { loadCache, saveCache, saveFilterQuery, isCacheValidForRepos } from "./cache"
import { theme } from "./theme"
import type { Config } from "./config"

interface AppProps {
  config: Config
}

export function App({ config }: AppProps) {
  const renderer = useRenderer()
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [history, setHistory] = useState<History>(() => loadHistory())



  // Parse and apply filter to PRs
  const filter = useMemo(
    () => parseFilter(state.discoveryQuery),
    [state.discoveryQuery]
  )

  // Build repo config map for starred-only filtering
  const repoConfig = useMemo(
    () => new Map(config.repositories.map((r) => [r.name, r])),
    [config.repositories]
  )

  // Apply filters: first regular filter, then starred-only filter
  const { filteredPRs, hiddenCount } = useMemo(() => {
    const afterFilter = applyFilter(state.prs, filter)
    const result = applyStarredOnlyFilter(afterFilter, filter, {
      starredAuthors: history.starredAuthors,
      repoConfig,
    })
    return { filteredPRs: result.filtered, hiddenCount: result.hiddenCount }
  }, [state.prs, filter, repoConfig, history.starredAuthors])

  // Reset selection when filter changes
  useEffect(() => {
    dispatch({ type: "SELECT", index: 0 })
  }, [state.discoveryQuery])

  // Fetch PR on-demand when a URL/reference is pasted
  useEffect(() => {
    if (!filter.prRef) return

    const { repo, number } = filter.prRef
    
    // Check if we already have this PR
    const existingPR = state.prs.find((pr) => {
      if (pr.number !== number) return false
      if (repo) {
        const prRepo = pr.url.match(/github\.com\/([^/]+\/[^/]+)\/pull/)?.[1]
        return prRepo?.toLowerCase().includes(repo.toLowerCase())
      }
      return true
    })

    if (existingPR) return // Already have it

    // Need to fetch - but we need a full repo name
    if (!repo || !repo.includes("/")) {
      // Can't fetch without full repo name
      return
    }

    // Fetch the PR
    dispatch({ type: "SHOW_MESSAGE", message: `Fetching PR #${number}...` })
    getPR(repo, number).then((pr) => {
      if (pr) {
        // Add to the list
        dispatch({ type: "SET_PRS", prs: [pr, ...state.prs] })
        dispatch({ type: "SHOW_MESSAGE", message: `Loaded PR #${number}` })
      } else {
        dispatch({ type: "SHOW_MESSAGE", message: `PR #${number} not found` })
      }
    })
  }, [filter.prRef?.repo, filter.prRef?.number])

  // Clear message after timeout
  useEffect(() => {
    if (state.message) {
      const timer = setTimeout(() => {
        dispatch({ type: "CLEAR_MESSAGE" })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [state.message])

  // Fetch PRs from GitHub (only enabled repos)
  const fetchPRs = useCallback(async (showAsRefresh = false) => {
    // Only fetch from enabled repos (not disabled)
    const repos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)
    
    if (repos.length === 0) {
      // Single repo - just load normally
      dispatch({ type: "SET_LOADING", loading: true })
      try {
        const prs = await listPRs()
        dispatch({ type: "SET_PRS", prs })
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to fetch PRs",
        })
      }
      return
    }

    // Show refreshing indicator or full loading screen
    if (showAsRefresh) {
      dispatch({ type: "SET_REFRESHING", refreshing: true })
    } else {
      dispatch({ type: "SET_LOADING", loading: true })
    }

    try {
      const prs = await listPRsFromRepos(repos)
      dispatch({ type: "SET_PRS", prs })
      // Save to cache for next startup
      saveCache(prs, repos)
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
  }, [config.repositories])

  // Load cached data on mount, then revalidate
  useEffect(() => {
    // Only consider enabled repos for cache validation
    const repos = config.repositories
      .filter((r) => !r.disabled)
      .map((r) => r.name)
    
    // Try to load from cache first
    const cache = loadCache()
    if (isCacheValidForRepos(cache, repos) && cache.prs.length > 0) {
      // Show cached data immediately, disable loading spinner
      dispatch({ type: "SET_PRS", prs: cache.prs })
      // Restore filter query if present
      if (cache.filterQuery) {
        dispatch({ type: "SET_DISCOVERY_QUERY", query: cache.filterQuery })
      }
      // Then revalidate in background (show as refresh, not full load)
      fetchPRs(true)
    } else {
      // No valid cache, do full load
      fetchPRs(false)
    }
  }, []) // Only run on mount

  // Save filter query when it changes
  useEffect(() => {
    saveFilterQuery(state.discoveryQuery)
  }, [state.discoveryQuery])

  // Keyboard handling
  useKeyboard((key) => {
    // Discovery bar is open - let it handle its own keys (no global shortcuts)
    if (state.discoveryVisible) {
      return
    }

    // Quit (only when discovery bar is closed)
    if (key.name === config.keys.quit) {
      renderer.destroy()
      process.exit(0)
    }

    // Open discovery bar with /
    if (key.name === "/") {
      dispatch({ type: "OPEN_DISCOVERY" })
      return
    }

    // Clear filter with Escape (when filter is active but bar is closed)
    if (key.name === "escape" && isFilterActive(filter)) {
      dispatch({ type: "SET_DISCOVERY_QUERY", query: "" })
      return
    }

    // Star/unstar author with s
    if (key.name === "s") {
      const pr = filteredPRs[state.selectedIndex]
      if (pr) {
        const newHistory = toggleStarAuthor(history, pr.author.login)
        setHistory(newHistory)
        saveHistory(newHistory)
        const isNowStarred = newHistory.starredAuthors.includes(pr.author.login)
        dispatch({
          type: "SHOW_MESSAGE",
          message: `${isNowStarred ? "★ Starred" : "☆ Unstarred"} @${pr.author.login}`,
        })
      }
      return
    }

    // Refresh (full) - R or Shift+r
    if (key.name === config.keys.refresh || (key.name === "r" && key.shift)) {
      fetchPRs(true)
      return
    }

    // Navigation (on filtered list)
    if (key.name === "j" || key.name === "down") {
      dispatch({ type: "MOVE", delta: 1 })
      return
    }
    if (key.name === "k" || key.name === "up") {
      dispatch({ type: "MOVE", delta: -1 })
      return
    }

    // Jump to top/bottom
    if (key.name === "g" && !key.shift) {
      dispatch({ type: "SELECT", index: 0 })
      return
    }
    if (key.name === "g" && key.shift) {
      dispatch({ type: "SELECT", index: filteredPRs.length - 1 })
      return
    }

    // External tools
    const selectedPR = filteredPRs[state.selectedIndex]
    if (!selectedPR) return

    // Open in browser
    if (key.name === "o") {
      dispatch({ type: "SHOW_MESSAGE", message: "Opening in browser..." })
      openInBrowser(selectedPR).catch(() => {
        dispatch({ type: "SHOW_MESSAGE", message: "Failed to open browser" })
      })
      return
    }

    // Open in riff (suspend TUI) - Enter only
    if (key.name === "return") {
      renderer.suspend()
      openInRiff(selectedPR).finally(() => {
        renderer.resume()
      })
      return
    }

    // Copy PR number (y)
    if (key.name === "y" && !key.shift) {
      copyPRNumber(selectedPR)
        .then(() => {
          dispatch({ type: "SHOW_MESSAGE", message: `Copied #${selectedPR.number}` })
        })
        .catch(() => {
          dispatch({ type: "SHOW_MESSAGE", message: "Failed to copy" })
        })
      return
    }

    // Copy URL (Y / shift+y)
    if (key.name === "y" && key.shift) {
      copyPRUrl(selectedPR)
        .then(() => {
          dispatch({ type: "SHOW_MESSAGE", message: `Copied ${selectedPR.url}` })
        })
        .catch(() => {
          dispatch({ type: "SHOW_MESSAGE", message: "Failed to copy URL" })
        })
      return
    }
  })

  // Build status bar hints
  const hints = buildHints(state, config, filter, hiddenCount)

  // Header right side: show count info and hidden count
  const headerRight = useMemo(() => {
    const hidden = hiddenCount > 0 ? ` +${hiddenCount}` : ""
    if (isFilterActive(filter)) {
      return `${filteredPRs.length}/${state.prs.length}${hidden}`
    }
    if (hiddenCount > 0) {
      return `${filteredPRs.length} (${hidden} hidden)`
    }
    return state.prs.length > 0
      ? `${state.selectedIndex + 1}/${state.prs.length}`
      : ""
  }, [filter, filteredPRs.length, state.prs.length, state.selectedIndex, hiddenCount])

  return (
    <Shell>
      <Header
        title="PResto"
        loading={state.refreshing}
        right={headerRight}
      />

      {/* Main content area with relative positioning for popup */}
      <box flexGrow={1} position="relative">
        {state.loading ? (
          <Loading message="Fetching pull requests..." />
        ) : state.error ? (
          <box
            flexGrow={1}
            justifyContent="center"
            alignItems="center"
            flexDirection="column"
          >
            <text fg={theme.error}>Error: {state.error}</text>
            <text fg={theme.textDim}>Press {config.keys.refresh} to retry</text>
          </box>
        ) : (
          <PRList prs={filteredPRs} selectedIndex={state.selectedIndex} />
        )}

        {/* Suggestions popup - anchored to bottom of content area */}
        {state.discoveryVisible && (
          <DiscoverySuggestions
            query={state.discoveryQuery}
            onChange={(query) => dispatch({ type: "SET_DISCOVERY_QUERY", query })}
            onClose={() => dispatch({ type: "CLOSE_DISCOVERY" })}
            history={history}
            prs={state.prs}
            repositories={config.repositories}
          />
        )}

        {/* Message toast */}
        {state.message && (
          <box position="absolute" bottom={state.discoveryVisible ? 12 : 0} right={2}>
            <text fg={theme.primary}>{state.message}</text>
          </box>
        )}
      </box>

      {/* Command line - vim style at bottom, only when filtering */}
      {state.discoveryVisible && (
        <CommandLine
          query={state.discoveryQuery}
          onChange={(query) => dispatch({ type: "SET_DISCOVERY_QUERY", query })}
          onSubmit={() => dispatch({ type: "ACCEPT_DISCOVERY" })}
        />
      )}

      <StatusBar hints={hints} />
    </Shell>
  )
}

/** Build status bar hints based on current state */
function buildHints(
  state: typeof initialState,
  config: Config,
  filter: ReturnType<typeof parseFilter>,
  hiddenCount: number
): string[] {
  const hints: string[] = []

  if (state.discoveryVisible) {
    hints.push("Tab: complete")
    hints.push("Enter/Esc: done")
    return hints
  }

  if (state.loading) {
    hints.push("Loading...")
  } else if (state.prs.length > 0) {
    hints.push("/: filter")
    hints.push("j/k: navigate")
    hints.push("Enter: riff")
    hints.push("o: browser")
    hints.push("y: id")
    hints.push("Y: url")
    hints.push("s: star")
    if (hiddenCount > 0) {
      hints.push("*: show all")
    }
    if (isFilterActive(filter)) {
      hints.push("Esc: clear")
    }
  }

  hints.push(`${config.keys.quit}: quit`)

  return hints
}
