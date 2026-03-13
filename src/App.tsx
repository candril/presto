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
import { HelpOverlay } from "./components/HelpOverlay"
import { appReducer, createInitialState } from "./state"
import { loadHistory, type History } from "./history"
import { theme } from "./theme"
import type { Config } from "./config"
import {
  usePRData,
  useFiltering,
  useKeyboardNav,
  useMessage,
  useHeaderInfo,
  usePreview,
} from "./hooks"

interface AppProps {
  config: Config
}

export function App({ config }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  const [history, setHistory] = useState<History>(() => loadHistory())
  const [showHelp, setShowHelp] = useState(false)
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
    previewPosition: state.previewPosition,
    history,
    setHistory,
    dispatch,
    fetchPRs,
    terminalHeight,
    showHelp,
    setShowHelp,
  })

  // Feature: PR Preview
  const selectedPR = filteredPRs[state.selectedIndex] ?? null
  const { preview, loading: previewLoading } = usePreview({
    previewPosition: state.previewPosition,
    previewCache: state.previewCache,
    dispatch,
    selectedPR,
    allPRs: filteredPRs,
    selectedIndex: state.selectedIndex,
  })

  // Feature: Message toast
  useMessage({
    message: state.message,
    dispatch,
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

      {/* Main content area */}
      <box flexGrow={1} flexDirection={state.previewPosition === "bottom" ? "column" : "row"}>
        {/* PR List */}
        <box
          flexGrow={1}
          position="relative"
          width={state.previewPosition === "right" ? "50%" : "100%"}
          height={state.previewPosition === "bottom" ? "50%" : "100%"}
          overflow="hidden"
        >
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

        {/* Preview Panel - right or bottom based on position */}
        {state.previewPosition && (
          <PreviewPanel
            preview={preview}
            loading={previewLoading}
            scrollOffset={state.previewScrollOffset}
            position={state.previewPosition}
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

      <StatusBar filterQuery={state.discoveryQuery} />

      {/* Help overlay */}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </Shell>
  )
}
