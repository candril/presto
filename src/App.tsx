/**
 * Main application component
 */

import { useReducer, useEffect, useCallback } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { PRList } from "./components/PRList"
import { Loading } from "./components/Loading"
import { appReducer, initialState } from "./state"
import { listPRs, listPRsFromRepos } from "./providers/github"
import { theme } from "./theme"
import type { Config } from "./config"

interface AppProps {
  config: Config
}

export function App({ config }: AppProps) {
  const renderer = useRenderer()
  const [state, dispatch] = useReducer(appReducer, initialState)

  // Fetch PRs on mount
  const fetchPRs = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true })
    try {
      const repos = config.repositories.map((r) => r.name)
      const prs = repos.length > 0 ? await listPRsFromRepos(repos) : await listPRs()
      dispatch({ type: "SET_PRS", prs })
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        error: err instanceof Error ? err.message : "Failed to fetch PRs",
      })
    }
  }, [config.repositories])

  useEffect(() => {
    fetchPRs()
  }, [fetchPRs])

  // Keyboard handling
  useKeyboard((key) => {
    // Quit
    if (key.name === config.keys.quit) {
      renderer.destroy()
      process.exit(0)
    }

    // Refresh
    if (key.name === config.keys.refresh) {
      fetchPRs()
      return
    }

    // Navigation
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
      dispatch({ type: "SELECT", index: state.prs.length - 1 })
      return
    }
  })

  // Build status bar hints
  const hints = buildHints(state, config)

  // Get selected PR info for header
  const selectedPR = state.prs[state.selectedIndex]
  const headerRight = state.prs.length > 0 ? `${state.selectedIndex + 1}/${state.prs.length}` : ""

  return (
    <Shell>
      <Header title="presto" right={headerRight} />

      {/* Main content */}
      {state.loading ? (
        <Loading message="Fetching pull requests..." />
      ) : state.error ? (
        <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
          <text fg={theme.error}>Error: {state.error}</text>
          <text fg={theme.textDim}>Press {config.keys.refresh} to retry</text>
        </box>
      ) : (
        <PRList prs={state.prs} selectedIndex={state.selectedIndex} />
      )}

      <StatusBar hints={hints} />
    </Shell>
  )
}

/** Build status bar hints based on current state */
function buildHints(state: typeof initialState, config: Config): string[] {
  const hints: string[] = []

  if (state.loading) {
    hints.push("Loading...")
  } else if (state.prs.length > 0) {
    hints.push("j/k: navigate")
    hints.push("g/G: top/bottom")
    hints.push(`${config.keys.refresh}: refresh`)
  }

  hints.push(`${config.keys.quit}: quit`)

  return hints
}
