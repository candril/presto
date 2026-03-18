/**
 * Main application component
 * Uses vertical feature slices via custom hooks
 */

import { useReducer, useState, useEffect, useCallback } from "react"
import { useTerminalDimensions } from "@opentui/react"
import { useRenderer } from "@opentui/react"
import { useKeybindings } from "./keybindings"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { TabBar } from "./components/TabBar"
import { StatusBar } from "./components/StatusBar"
import { PRList } from "./components/PRList"
import { PreviewPanel } from "./components/PreviewPanel"
import { Loading } from "./components/Loading"
import { DiscoverySuggestions } from "./components/DiscoverySuggestions"
import { CommandLine } from "./components/CommandLine"
import { HelpOverlay } from "./components/HelpOverlay"
import { CommandPalette } from "./components/CommandPalette"
import { NotificationToast } from "./components/NotificationToast"
import type { CommandContext, CommandResult } from "./commands"
import {
  detectChanges,
  updateAllSnapshots,
  markPRSeen,
  markPRHasChanges,
  getPRKey,
  sendDesktopNotification,
  formatChangesForDesktop,
  type PRChange,
} from "./notifications"
import { saveHistory } from "./history"
import { getRepoName } from "./types"
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
  useAutoRefresh,
  useTabNotifications,
} from "./hooks"
import { debouncedSaveTabs } from "./tabs"
import type { FocusCallback } from "./utils/focus-reporting"

interface AppProps {
  config: Config
  currentUser: string | null
  /** Register a callback for terminal focus changes (tmux pane/window switches) */
  onFocusChange?: (cb: FocusCallback) => () => void
}

export function App({ config, currentUser, onFocusChange }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  const [history, setHistory] = useState<History>(() => loadHistory())
  const [showHelp, setShowHelp] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PRChange[]>([])
  const [initialSnapshotsDone, setInitialSnapshotsDone] = useState(false)
  const { height: terminalHeight } = useTerminalDimensions()
  const renderer = useRenderer()
  const keys = useKeybindings(config)

  // Feature: Filtering
  const { filter, filteredPRs, hiddenCount } = useFiltering({
    config,
    prs: state.prs,
    discoveryQuery: state.discoveryQuery,
    history,
    dispatch,
    currentUser,
  })

  // Feature: PR data fetching
  const { fetchPRs } = usePRData({
    config,
    filter,
    prs: state.prs,
    dispatch,
    history,
    setHistory,
    currentUser,
  })

  // Feature: Notifications - detect changes when PRs update
  const handlePRsUpdated = useCallback(
    (prs: typeof state.prs, isRefresh: boolean) => {
      // On first load, just create snapshots without showing notifications
      if (!initialSnapshotsDone) {
        const newHistory = updateAllSnapshots(history, prs, currentUser)
        setHistory(newHistory)
        saveHistory(newHistory)
        setInitialSnapshotsDone(true)
        return
      }

      // On refresh, detect changes first
      if (isRefresh) {
        const changes = detectChanges(prs, history, currentUser)
        if (changes.length > 0) {
          // Group changes by PR key
          const changesByPR = new Map<string, typeof changes>()
          for (const change of changes) {
            const existing = changesByPR.get(change.prKey) ?? []
            existing.push(change)
            changesByPR.set(change.prKey, existing)
          }

          // Mark PRs as having changes
          let newHistory = history
          for (const [prKey, prChanges] of changesByPR) {
            const detectedChanges = prChanges.map((c) => ({ type: c.changeType, message: c.message }))
            newHistory = markPRHasChanges(newHistory, prKey, detectedChanges)
          }
          // Update snapshots with new state
          newHistory = updateAllSnapshots(newHistory, prs, currentUser)
          setHistory(newHistory)
          saveHistory(newHistory)
          // Show toast
          setPendingChanges(changes)
          
          // Send desktop notification
          if (config.notifications.desktop) {
            const notification = formatChangesForDesktop(changes)
            if (notification) {
              sendDesktopNotification(notification)
            }
          }
          return
        }
      }

      // Just update snapshots
      const newHistory = updateAllSnapshots(history, prs, currentUser)
      setHistory(newHistory)
      saveHistory(newHistory)
    },
    [history, currentUser, initialSnapshotsDone]
  )

  // Detect changes when PRs change (after refresh)
  useEffect(() => {
    if (state.prs.length > 0 && !state.loading) {
      handlePRsUpdated(state.prs, state.lastRefresh !== null)
    }
  }, [state.prs, state.loading, handlePRsUpdated])

  // Feature: Auto-refresh
  const { isStale } = useAutoRefresh({
    interval: config.refresh.interval,
    onFocus: config.refresh.onFocus,
    onRefresh: () => fetchPRs(true),
    lastRefresh: state.lastRefresh,
    onRefreshComplete: (time) => dispatch({ type: "SET_LAST_REFRESH", time }),
    registerFocusCallback: onFocusChange,
  })

  // Feature: Keyboard navigation
  useKeyboardNav({
    config,
    filter,
    filteredPRs,
    selectedIndex: state.selectedIndex,
    discoveryVisible: state.discoveryVisible,
    commandPaletteVisible: state.commandPaletteVisible,
    previewPosition: state.previewPosition,
    history,
    setHistory,
    dispatch,
    fetchPRs,
    terminalHeight,
    showHelp,
    setShowHelp,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  })

  // Feature: PR Preview
  const selectedPR = filteredPRs[state.selectedIndex] ?? null
  
  // Get change info from snapshot (persists until PR is marked as seen)
  const selectedPRSnapshot = selectedPR
    ? history.prSnapshots?.[getPRKey(getRepoName(selectedPR), selectedPR.number)]
    : null
  const selectedPRChanges = selectedPRSnapshot?.hasChanges && selectedPRSnapshot?.changes?.length
    ? selectedPRSnapshot.changes
    : null

  // Note: PR is marked as seen (dot cleared) when opened via p/Enter/o, not on selection
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

  // Tab persistence - save when tabs change
  useEffect(() => {
    debouncedSaveTabs(state.tabs, state.activeTabId)
  }, [state.tabs, state.activeTabId])

  // Tab notification dots - update based on displayed PRs (smart refresh)
  useTabNotifications({
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    filteredPRs,
    allPRs: state.prs,
    history,
    config,
    currentUser,
    dispatch,
  })

  // Command palette context
  const commandContext: CommandContext = {
    selectedPR,
    dispatch,
    config,
    history,
    setHistory,
    renderer,
    fetchPRs,
    setShowHelp,
    columnVisibility: state.columnVisibility,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  }

  // Handle command palette results
  const handleCommandResult = (result: CommandResult) => {
    if (result.type === "success" && result.message) {
      dispatch({ type: "SHOW_MESSAGE", message: result.message })
    } else if (result.type === "error") {
      dispatch({ type: "SHOW_MESSAGE", message: `Error: ${result.message}` })
    } else if (result.type === "refresh") {
      fetchPRs(true)
    }
  }

  return (
    <Shell>
      <Header
        title="PResto"
        loading={state.refreshing}
        right={headerRight}
        lastRefresh={state.lastRefresh}
        isStale={isStale}
      />
      <TabBar
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        onTabChange={(tabId) => dispatch({ type: "SWITCH_TAB", tabId })}
        repositories={config.repositories}
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
            <PRList 
              prs={filteredPRs} 
              selectedIndex={state.selectedIndex} 
              columnVisibility={state.columnVisibility} 
              previewPosition={state.previewPosition} 
              history={history}
              emptyMessage={
                filter.starred && history.starredAuthors.length === 0
                  ? "No starred authors"
                  : undefined
              }
              emptyHint={
                filter.starred && history.starredAuthors.length === 0
                  ? "Press 's' on a PR to star its author"
                  : undefined
              }
            />
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
            changes={selectedPRChanges}
            seenAt={selectedPRSnapshot?.seenAt}
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

      <StatusBar filterQuery={state.discoveryVisible ? undefined : state.discoveryQuery} />

      {/* Help overlay */}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} keys={keys} />}

      {/* Command palette */}
      <CommandPalette
        visible={state.commandPaletteVisible}
        context={commandContext}
        onClose={() => dispatch({ type: "CLOSE_COMMAND_PALETTE" })}
        onResult={handleCommandResult}
      />

      {/* Notification toast */}
      {pendingChanges.length > 0 && (
        <NotificationToast
          changes={pendingChanges}
          onDismiss={() => setPendingChanges([])}
        />
      )}
    </Shell>
  )
}
