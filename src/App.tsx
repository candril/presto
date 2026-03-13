/**
 * Main application component
 * Uses vertical feature slices via custom hooks
 */

import { useReducer, useState } from "react"
import { useTerminalDimensions } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { PRList } from "./components/PRList"
import { PreviewPanel } from "./components/PreviewPanel"
import { Loading } from "./components/Loading"
import { DiscoverySuggestions } from "./components/DiscoverySuggestions"
import { CommandLine } from "./components/CommandLine"
import { appReducer, createInitialState } from "./state"
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
  usePreview,
} from "./hooks"

interface AppProps {
  config: Config
}

export function App({ config }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  const [history, setHistory] = useState<History>(() => loadHistory())
  const { height: terminalHeight } = useTerminalDimensions()

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
    previewMode: state.previewMode,
    history,
    setHistory,
    dispatch,
    fetchPRs,
    terminalHeight,
  })

  // Feature: PR Preview
  const selectedPR = filteredPRs[state.selectedIndex] ?? null
  const { preview, loading: previewLoading } = usePreview({
    previewMode: state.previewMode,
    previewCache: state.previewCache,
    dispatch,
    selectedPR,
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
    previewMode: state.previewMode,
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
        previewMode={state.previewMode}
        previewLoading={previewLoading}
      />

      {/* Main content area */}
      <box flexGrow={1} flexDirection="row">
        {/* Left side: PR List */}
        <box flexGrow={1} position="relative" width={state.previewMode ? "50%" : "100%"} overflow="hidden">
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

        {/* Right side: Preview Panel */}
        {state.previewMode && (
          <PreviewPanel
            preview={preview}
            loading={previewLoading}
            scrollOffset={state.previewScrollOffset}
          />
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
