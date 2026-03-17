/**
 * Hook for keyboard navigation and shortcuts
 * Handles all keyboard interactions
 */

import { useKeyboard, useRenderer } from "@opentui/react"
import { openInBrowser, openInRiff, copyPRUrl, copyPRNumber } from "../actions"
import { checkoutPR } from "../actions/checkout"
import {
  toggleStarAuthor,
  saveHistory,
  toggleMarkPR,
  isPRMarked,
  getPRKey,
  recordPRView,
  recordRepoVisit,
  type History,
} from "../history"
import { markPRSeen } from "../notifications"
import { isFilterActive, type ParsedFilter } from "../discovery"
import type { Config } from "../config"
import type { PR, PreviewPosition, Tab } from "../types"
import { getRepoName } from "../types"
import { useKeybindings } from "../keybindings"

export interface UseKeyboardNavOptions {
  config: Config
  filter: ParsedFilter
  filteredPRs: PR[]
  selectedIndex: number
  discoveryVisible: boolean
  commandPaletteVisible: boolean
  previewPosition: PreviewPosition
  history: History
  setHistory: (history: History) => void
  dispatch: (action: any) => void
  fetchPRs: (showAsRefresh?: boolean) => void
  terminalHeight: number
  showHelp: boolean
  setShowHelp: (show: boolean) => void
  // Tab state (spec 011)
  tabs: Tab[]
  activeTabId: string
}

export function useKeyboardNav({
  config,
  filter,
  filteredPRs,
  selectedIndex,
  discoveryVisible,
  commandPaletteVisible,
  previewPosition,
  history,
  setHistory,
  dispatch,
  fetchPRs,
  terminalHeight,
  showHelp,
  setShowHelp,
  tabs,
  activeTabId,
}: UseKeyboardNavOptions) {
  const renderer = useRenderer()
  const keys = useKeybindings(config)

  useKeyboard((key) => {
    // Command palette is open - let it handle its own keys
    if (commandPaletteVisible) {
      return
    }

    // Help overlay - ? toggles, Esc closes
    if (keys.matches(key, "ui.help")) {
      setShowHelp(!showHelp)
      return
    }
    if (showHelp) {
      // Close help with Escape or any navigation key
      if (key.name === "escape" || key.name === "q") {
        setShowHelp(false)
      }
      return
    }

    // Discovery bar is open - let it handle its own keys
    if (discoveryVisible) {
      return
    }

    // Open command palette
    if (keys.matches(key, "ui.commandPalette")) {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Tab shortcuts (spec 011)
    // New tab (duplicate current)
    if (keys.matches(key, "tab.new")) {
      dispatch({ type: "DUPLICATE_TAB" })
      dispatch({ type: "SHOW_MESSAGE", message: "Tab duplicated" })
      return
    }

    // Close current tab (if more than one)
    if (keys.matches(key, "tab.close") && tabs.length > 1) {
      const currentIndex = tabs.findIndex(t => t.id === activeTabId)
      const currentTab = tabs[currentIndex]
      dispatch({ type: "CLOSE_TAB", tabId: activeTabId })
      dispatch({ type: "SHOW_MESSAGE", message: `Closed "${currentTab?.title}"` })
      // Store for undo
      dispatch({ type: "STORE_CLOSED_TAB", tab: currentTab, index: currentIndex })
      return
    }

    // Undo last closed tab
    if (keys.matches(key, "tab.undo")) {
      dispatch({ type: "UNDO_CLOSE_TAB" })
      return
    }

    // Navigate between tabs
    if (keys.matches(key, "tab.prev") && tabs.length > 1) {
      const currentIndex = tabs.findIndex(t => t.id === activeTabId)
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
      dispatch({ type: "SWITCH_TAB", tabId: tabs[prevIndex].id })
      return
    }
    if (keys.matches(key, "tab.next") && tabs.length > 1) {
      const currentIndex = tabs.findIndex(t => t.id === activeTabId)
      const nextIndex = (currentIndex + 1) % tabs.length
      dispatch({ type: "SWITCH_TAB", tabId: tabs[nextIndex].id })
      return
    }

    // Number keys 1-9 to switch tabs
    for (let i = 1; i <= 9; i++) {
      if (keys.matches(key, `tab.${i}` as any) && i <= tabs.length) {
        dispatch({ type: "SWITCH_TAB", tabId: tabs[i - 1].id })
        return
      }
    }

    // Special filter shortcuts (spec 015)
    // Toggle >marked filter
    if (keys.matches(key, "filter.marked")) {
      const current = filter.marked ? "" : ">marked"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }
    // Toggle >recent filter
    if (keys.matches(key, "filter.recent")) {
      const current = filter.recent ? "" : ">recent"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }
    // Toggle >starred filter
    if (keys.matches(key, "filter.starred")) {
      const current = filter.starred ? "" : ">starred"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }
    // Toggle @me filter (my PRs)
    if (keys.matches(key, "filter.expanded")) {
      const hasMe = filter.authors.includes("me") || (filter.authors.length === 1 && filter.authors[0] === "me")
      const current = hasMe ? "" : "@me"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }

    // Preview mode: page down/up for scrolling
    if (previewPosition) {
      const halfPage = Math.floor((terminalHeight - 6) / 2)
      if (keys.matches(key, "nav.pageDown")) {
        dispatch({ type: "SCROLL_PREVIEW", delta: halfPage })
        return
      }
      if (keys.matches(key, "nav.pageUp")) {
        dispatch({ type: "SCROLL_PREVIEW", delta: -halfPage })
        return
      }
    }

    // Preview controls: toggle on/off, cycle position
    if (keys.matches(key, "ui.preview")) {
      // If closing preview, mark PR as seen (clear notification dot)
      if (previewPosition) {
        const pr = filteredPRs[selectedIndex]
        if (pr) {
          const prKey = getPRKey(getRepoName(pr), pr.number)
          if (history.prSnapshots?.[prKey]?.hasChanges) {
            const newHistory = markPRSeen(history, prKey)
            setHistory(newHistory)
            saveHistory(newHistory)
          }
        }
      }
      dispatch({ type: "TOGGLE_PREVIEW" })
      return
    }
    if (keys.matches(key, "ui.previewCycle")) {
      dispatch({ type: "CYCLE_PREVIEW_POSITION" })
      return
    }

    // Quit
    if (keys.matches(key, "ui.quit")) {
      renderer.destroy()
      process.exit(0)
    }

    // Open discovery bar
    if (keys.matches(key, "filter.open")) {
      dispatch({ type: "OPEN_DISCOVERY" })
      return
    }

    // Clear filter (only when filter is active)
    if (keys.matches(key, "filter.clear") && isFilterActive(filter)) {
      dispatch({ type: "SET_DISCOVERY_QUERY", query: "" })
      return
    }

    // Star/unstar author
    if (keys.matches(key, "action.star")) {
      const pr = filteredPRs[selectedIndex]
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

    // Mark/unmark PR (spec 015)
    if (keys.matches(key, "action.mark")) {
      const pr = filteredPRs[selectedIndex]
      if (pr) {
        const prKey = getPRKey(getRepoName(pr), pr.number)
        const newHistory = toggleMarkPR(history, prKey)
        setHistory(newHistory)
        saveHistory(newHistory)
        const isNowMarked = isPRMarked(newHistory, prKey)
        dispatch({
          type: "SHOW_MESSAGE",
          message: isNowMarked ? "Marked" : "Unmarked",
        })
      }
      return
    }

    // Refresh
    if (keys.matches(key, "action.refresh") || keys.matches(key, "action.forceRefresh")) {
      fetchPRs(true)
      return
    }

    // Navigation - clamp to filtered list bounds
    // Helper to mark current PR as seen when navigating with preview open
    const markCurrentAsSeen = () => {
      if (previewPosition) {
        const pr = filteredPRs[selectedIndex]
        if (pr) {
          const prKey = getPRKey(getRepoName(pr), pr.number)
          if (history.prSnapshots?.[prKey]?.hasChanges) {
            const newHistory = markPRSeen(history, prKey)
            setHistory(newHistory)
            saveHistory(newHistory)
          }
        }
      }
    }

    if (keys.matches(key, "nav.down") || key.name === "down") {
      markCurrentAsSeen()
      const newIndex = Math.min(selectedIndex + 1, filteredPRs.length - 1)
      dispatch({ type: "SELECT", index: newIndex })
      return
    }
    if (keys.matches(key, "nav.up") || key.name === "up") {
      markCurrentAsSeen()
      const newIndex = Math.max(selectedIndex - 1, 0)
      dispatch({ type: "SELECT", index: newIndex })
      return
    }

    // Jump to top/bottom
    if (keys.matches(key, "nav.top")) {
      dispatch({ type: "SELECT", index: 0 })
      return
    }
    if (keys.matches(key, "nav.bottom")) {
      dispatch({ type: "SELECT", index: filteredPRs.length - 1 })
      return
    }

    // External tools
    const selectedPR = filteredPRs[selectedIndex]
    if (!selectedPR) return

    // Helper to record PR interaction (view, repo visit, mark seen)
    const recordPRInteraction = () => {
      const repo = getRepoName(selectedPR)
      const prKey = getPRKey(repo, selectedPR.number)
      let newHistory = recordPRView(history, {
        repo,
        number: selectedPR.number,
        title: selectedPR.title,
        author: selectedPR.author.login,
      })
      newHistory = recordRepoVisit(newHistory, repo)
      newHistory = markPRSeen(newHistory, prKey)
      setHistory(newHistory)
      saveHistory(newHistory)
    }

    // Open in browser
    if (keys.matches(key, "action.browser")) {
      recordPRInteraction()
      dispatch({ type: "SHOW_MESSAGE", message: "Opening in browser..." })
      openInBrowser(selectedPR).catch(() => {
        dispatch({ type: "SHOW_MESSAGE", message: "Failed to open browser" })
      })
      return
    }

    // Open in default tool (riff)
    if (keys.matches(key, "action.open")) {
      recordPRInteraction()
      renderer.suspend()
      openInRiff(selectedPR).finally(() => {
        renderer.resume()
      })
      return
    }

    // Copy PR number
    if (keys.matches(key, "action.copyNumber")) {
      copyPRNumber(selectedPR)
        .then(() => {
          dispatch({ type: "SHOW_MESSAGE", message: `Copied #${selectedPR.number}` })
        })
        .catch(() => {
          dispatch({ type: "SHOW_MESSAGE", message: "Failed to copy" })
        })
      return
    }

    // Copy URL
    if (keys.matches(key, "action.copyUrl")) {
      copyPRUrl(selectedPR)
        .then(() => {
          dispatch({ type: "SHOW_MESSAGE", message: `Copied ${selectedPR.url}` })
        })
        .catch(() => {
          dispatch({ type: "SHOW_MESSAGE", message: "Failed to copy URL" })
        })
      return
    }

    // Checkout PR locally
    if (keys.matches(key, "action.checkout")) {
      dispatch({ type: "SHOW_MESSAGE", message: "Checking out..." })
      checkoutPR(selectedPR, config)
        .then((result) => {
          dispatch({
            type: "SHOW_MESSAGE",
            message: result.message,
          })
        })
        .catch((err) => {
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Checkout failed: ${err}`,
          })
        })
      return
    }
  })
}
