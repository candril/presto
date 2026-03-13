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
import { appReducer, initialState } from "./state"
import { listPRs, listPRsFromRepos, listRecentPRsFromRepos } from "./providers/github"
import { parseFilter, applyFilter, isFilterActive } from "./discovery"
import {
  loadHistory,
  saveHistory,
  toggleStarAuthor,
  type History,
} from "./history"
import { openInBrowser, openInRiff, copyPRUrl } from "./actions"
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
  const filteredPRs = useMemo(
    () => applyFilter(state.prs, filter),
    [state.prs, filter]
  )

  // Reset selection when filter changes
  useEffect(() => {
    dispatch({ type: "SELECT", index: 0 })
  }, [state.discoveryQuery])

  // Clear message after timeout
  useEffect(() => {
    if (state.message) {
      const timer = setTimeout(() => {
        dispatch({ type: "CLEAR_MESSAGE" })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [state.message])

  // Fetch PRs from GitHub
  const fetchPRs = useCallback(async (showAsRefresh = false) => {
    const repos = config.repositories.map((r) => r.name)
    
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
    const repos = config.repositories.map((r) => r.name)
    
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
    // Discovery bar is open - let it handle its own keys
    if (state.discoveryVisible) {
      // Only quit works while discovery is open
      if (key.name === config.keys.quit) {
        renderer.destroy()
        process.exit(0)
      }
      return
    }

    // Quit
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
    if (key.name === "g") {
      dispatch({ type: "SELECT", index: 0 })
      return
    }
    if (key.name === "G") {
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

    // Open in riff (suspend TUI) - Enter or r
    if (key.name === "return" || key.name === "r") {
      renderer.suspend()
      openInRiff(selectedPR).finally(() => {
        renderer.resume()
      })
      return
    }

    // Copy URL
    if (key.name === "y") {
      copyPRUrl(selectedPR)
        .then(() => {
          dispatch({ type: "SHOW_MESSAGE", message: "URL copied to clipboard" })
        })
        .catch(() => {
          dispatch({ type: "SHOW_MESSAGE", message: "Failed to copy URL" })
        })
      return
    }
  })

  // Build status bar hints
  const hints = buildHints(state, config, filter)

  // Header right side: show count info
  const headerRight = useMemo(() => {
    if (isFilterActive(filter)) {
      return `${filteredPRs.length}/${state.prs.length}`
    }
    return state.prs.length > 0
      ? `${state.selectedIndex + 1}/${state.prs.length}`
      : ""
  }, [filter, filteredPRs.length, state.prs.length, state.selectedIndex])

  return (
    <Shell>
      <Header
        title="presto"
        filterQuery={state.discoveryQuery}
        filterFocused={state.discoveryVisible}
        onFilterChange={(query) => dispatch({ type: "SET_DISCOVERY_QUERY", query })}
        onFilterSubmit={() => dispatch({ type: "ACCEPT_DISCOVERY" })}
        loading={state.refreshing}
        right={headerRight}
      />

      {/* Suggestions dropdown (when filter focused) */}
      {state.discoveryVisible && (
        <DiscoverySuggestions
          query={state.discoveryQuery}
          onChange={(query) => dispatch({ type: "SET_DISCOVERY_QUERY", query })}
          onClose={() => dispatch({ type: "CLOSE_DISCOVERY" })}
          history={history}
          prs={state.prs}
        />
      )}

      {/* Main content */}
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

      {/* Message toast */}
      {state.message && (
        <box position="absolute" bottom={1} right={2}>
          <text fg={theme.primary}>{state.message}</text>
        </box>
      )}

      <StatusBar hints={hints} />
    </Shell>
  )
}

/** Build status bar hints based on current state */
function buildHints(
  state: typeof initialState,
  config: Config,
  filter: ReturnType<typeof parseFilter>
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
    hints.push("y: copy")
    hints.push("s: star")
    if (isFilterActive(filter)) {
      hints.push("Esc: clear")
    }
  }

  hints.push(`${config.keys.quit}: quit`)

  return hints
}
