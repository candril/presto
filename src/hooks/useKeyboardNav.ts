/**
 * Hook for keyboard navigation and shortcuts
 * Handles all keyboard interactions
 */

import { useKeyboard, useRenderer } from "@opentui/react"
import { openInBrowser, openInRiff, copyPRUrl, copyPRNumber } from "../actions"
import {
  toggleStarAuthor,
  saveHistory,
  toggleMarkPR,
  isPRMarked,
  getPRKey,
  recordPRView,
  type History,
} from "../history"
import { isFilterActive, type ParsedFilter } from "../discovery"
import type { Config } from "../config"
import type { PR, PreviewPosition } from "../types"
import { getRepoName } from "../types"

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
}: UseKeyboardNavOptions) {
  const renderer = useRenderer()

  useKeyboard((key) => {
    // Command palette is open - let it handle its own keys
    if (commandPaletteVisible) {
      return
    }

    // Help overlay - ? toggles, Esc closes
    if (key.name === "?" || (key.name === "/" && key.shift)) {
      setShowHelp(!showHelp)
      return
    }
    if (showHelp) {
      if (key.name === "escape") {
        setShowHelp(false)
      }
      return
    }

    // Discovery bar is open - let it handle its own keys
    if (discoveryVisible) {
      return
    }

    // Open command palette with Ctrl-p
    if (key.ctrl && key.name === "p") {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Special filter shortcuts (spec 015)
    // Ctrl+M: Toggle >marked filter
    if (key.ctrl && key.name === "m") {
      const current = filter.marked ? "" : ">marked"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }
    // Ctrl+R: Toggle >recent filter
    if (key.ctrl && key.name === "r") {
      const current = filter.recent ? "" : ">recent"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }
    // Ctrl+S: Toggle >starred filter
    if (key.ctrl && key.name === "s") {
      const current = filter.starred ? "" : ">starred"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }
    // Ctrl+E: Toggle @me filter (my PRs)
    if (key.ctrl && key.name === "e") {
      const hasMe = filter.authors.includes("me") || (filter.authors.length === 1 && filter.authors[0] === "me")
      const current = hasMe ? "" : "@me"
      dispatch({ type: "SET_DISCOVERY_QUERY", query: current })
      return
    }

    // Preview mode: Ctrl-d/Ctrl-u for scrolling
    if (previewPosition) {
      const halfPage = Math.floor((terminalHeight - 6) / 2)
      if (key.ctrl && key.name === "d") {
        dispatch({ type: "SCROLL_PREVIEW", delta: halfPage })
        return
      }
      if (key.ctrl && key.name === "u") {
        dispatch({ type: "SCROLL_PREVIEW", delta: -halfPage })
        return
      }
    }

    // Preview controls: p = toggle on/off, P = cycle position
    if (key.name === "p" && !key.shift) {
      dispatch({ type: "TOGGLE_PREVIEW" })
      return
    }
    if (key.name === "p" && key.shift) {
      dispatch({ type: "CYCLE_PREVIEW_POSITION" })
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

    // Clear filter with Escape or Backspace
    if ((key.name === "escape" || key.name === "backspace") && isFilterActive(filter)) {
      dispatch({ type: "SET_DISCOVERY_QUERY", query: "" })
      return
    }

    // Star/unstar author with s
    if (key.name === "s") {
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

    // Mark/unmark PR with m (spec 015)
    if (key.name === "m") {
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
    if (key.name === config.keys.refresh || (key.name === "r" && key.shift)) {
      fetchPRs(true)
      return
    }

    // Navigation - clamp to filtered list bounds
    if (key.name === "j" || key.name === "down") {
      const newIndex = Math.min(selectedIndex + 1, filteredPRs.length - 1)
      dispatch({ type: "SELECT", index: newIndex })
      return
    }
    if (key.name === "k" || key.name === "up") {
      const newIndex = Math.max(selectedIndex - 1, 0)
      dispatch({ type: "SELECT", index: newIndex })
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
    const selectedPR = filteredPRs[selectedIndex]
    if (!selectedPR) return

    // Open in browser
    if (key.name === "o") {
      // Record to recent history (spec 015)
      const newHistory = recordPRView(history, {
        repo: getRepoName(selectedPR),
        number: selectedPR.number,
        title: selectedPR.title,
        author: selectedPR.author.login,
      })
      setHistory(newHistory)
      saveHistory(newHistory)

      dispatch({ type: "SHOW_MESSAGE", message: "Opening in browser..." })
      openInBrowser(selectedPR).catch(() => {
        dispatch({ type: "SHOW_MESSAGE", message: "Failed to open browser" })
      })
      return
    }

    // Open in riff
    if (key.name === "return") {
      // Record to recent history (spec 015)
      const newHistory = recordPRView(history, {
        repo: getRepoName(selectedPR),
        number: selectedPR.number,
        title: selectedPR.title,
        author: selectedPR.author.login,
      })
      setHistory(newHistory)
      saveHistory(newHistory)

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
}
