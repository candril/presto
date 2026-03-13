/**
 * Main application component
 * Uses vertical feature slices via custom hooks
 */

import { useReducer, useState } from "react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { PRList } from "./components/PRList"
import { Loading } from "./components/Loading"
import { DiscoverySuggestions } from "./components/DiscoverySuggestions"
import { CommandLine } from "./components/CommandLine"
import { appReducer, initialState } from "./state"
import { loadHistory, type History } from "./history"
import { theme } from "./theme"
import type { Config } from "./config"
import {
  usePRData,
  useFiltering,
  useKeyboardNav,
  useMessage,
  useStatusBar,
  useHeaderInfo,
} from "./hooks"

interface AppProps {
  config: Config
}

export function App({ config }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [history, setHistory] = useState<History>(() => loadHistory())

  // Feature: Filtering
  const { filter, filteredPRs, hiddenCount } = useFiltering({
    config,
    prs: state.prs,
    discoveryQuery: state.discoveryQuery,
    history,
    dispatch,
  })

  // Feature: PR data fetching
  const { fetchPRs } = usePRData({
    config,
    filter,
    prs: state.prs,
    dispatch,
  })

  // Feature: Keyboard navigation
  useKeyboardNav({
    config,
    filter,
    filteredPRs,
    selectedIndex: state.selectedIndex,
    discoveryVisible: state.discoveryVisible,
    history,
    setHistory,
    dispatch,
    fetchPRs,
  })

  // Feature: Message toast
  useMessage({
    message: state.message,
    dispatch,
  })

  // Feature: Status bar hints
  const hints = useStatusBar({
    config,
    filter,
    hiddenCount,
    loading: state.loading,
    discoveryVisible: state.discoveryVisible,
    prsCount: state.prs.length,
  })

  // Feature: Header info
  const headerRight = useHeaderInfo({
    filter,
    filteredCount: filteredPRs.length,
    totalCount: state.prs.length,
    selectedIndex: state.selectedIndex,
    hiddenCount,
  })

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
