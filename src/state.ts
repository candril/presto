/**
 * Application state management
 */

import type { AppState, PR, View, PreviewPosition, ColumnId, Tab } from "./types"
import { loadCache, getColumnVisibility } from "./cache"
import { getInitialTabsState, duplicateTab, generateTabTitle } from "./tabs"

/** Action types for the reducer */
export type AppAction =
  | { type: "SET_VIEW"; view: View }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_REFRESHING"; refreshing: boolean }
  | { type: "SET_LAST_REFRESH"; time: Date }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_PRS"; prs: PR[] }
  | { type: "APPEND_PRS"; prs: PR[] }
  | { type: "SELECT"; index: number }
  | { type: "MOVE"; delta: number }
  | { type: "OPEN_DISCOVERY" }
  | { type: "CLOSE_DISCOVERY" }
  | { type: "ACCEPT_DISCOVERY" }
  | { type: "SET_DISCOVERY_QUERY"; query: string }
  | { type: "SHOW_MESSAGE"; message: string }
  | { type: "CLEAR_MESSAGE" }
  // Preview actions (spec 014)
  | { type: "TOGGLE_PREVIEW" }
  | { type: "CYCLE_PREVIEW_POSITION" }
  | { type: "SET_PREVIEW_CACHE"; key: string; data: import("./types").PRPreview }
  | { type: "SET_PREVIEW_LOADING"; key: string | null }
  | { type: "CLEAR_PREVIEW_CACHE" }
  | { type: "SCROLL_PREVIEW"; delta: number }
  // Command palette actions (spec 010)
  | { type: "OPEN_COMMAND_PALETTE" }
  | { type: "CLOSE_COMMAND_PALETTE" }
  // Optimistic PR updates
  | { type: "UPDATE_PR"; url: string; updates: Partial<PR> }
  | { type: "REMOVE_PR"; url: string }
  // Column visibility
  | { type: "TOGGLE_COLUMN"; column: ColumnId }
  // Tab actions (spec 011)
  | { type: "DUPLICATE_TAB" }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "CLOSE_OTHER_TABS" }
  | { type: "SWITCH_TAB"; tabId: string }
  | { type: "UPDATE_TAB_NOTIFICATION"; tabId: string; hasNotification: boolean }
  | { type: "LOAD_TABS"; tabs: Tab[]; activeTabId: string }
  | { type: "STORE_CLOSED_TAB"; tab: Tab; index: number }
  | { type: "UNDO_CLOSE_TAB" }
  | { type: "RENAME_TAB"; tabId: string; title: string }

/** Create initial state, loading persisted filter from cache */
export function createInitialState(): AppState {
  const cache = loadCache()
  const tabsState = getInitialTabsState()
  
  // Use filter from active tab if available, otherwise from cache
  const activeTab = tabsState.tabs.find((t: Tab) => t.id === tabsState.activeTabId)
  const filterQuery = activeTab?.filterQuery ?? cache.filterQuery ?? ""
  
  return {
    view: "list",
    prs: [],
    selectedIndex: 0,
    loading: true,
    refreshing: false,
    lastRefresh: null,
    error: null,
    discoveryVisible: false,
    discoveryQuery: filterQuery,
    message: null,
    // Preview state (spec 014)
    previewPosition: null,
    previewCache: new Map(),
    previewLoading: null,
    previewScrollOffset: 0,
    // Command palette state (spec 010)
    commandPaletteVisible: false,
    // Column visibility (persisted)
    columnVisibility: getColumnVisibility(),
    // Tab state (spec 011)
    tabs: tabsState.tabs,
    activeTabId: tabsState.activeTabId,
    closedTab: null,
  }
}

/** State reducer */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view }

    case "SET_LOADING":
      return { ...state, loading: action.loading }

    case "SET_REFRESHING":
      return { ...state, refreshing: action.refreshing }

    case "SET_LAST_REFRESH":
      return { ...state, lastRefresh: action.time }

    case "SET_ERROR":
      return { ...state, error: action.error, loading: false }

    case "SET_PRS":
      return {
        ...state,
        prs: action.prs,
        loading: false,
        refreshing: false,
        error: null,
        // Reset selection if out of bounds
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, action.prs.length - 1)),
      }

    case "APPEND_PRS": {
      // Merge new PRs, avoiding duplicates by PR URL, keep sorted by updatedAt
      const existingUrls = new Set(state.prs.map(pr => pr.url))
      const newPRs = action.prs.filter(pr => !existingUrls.has(pr.url))
      const allPRs = [...state.prs, ...newPRs].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      return {
        ...state,
        prs: allPRs,
      }
    }

    case "SELECT":
      // Trust caller to pass valid index (they know the filtered list length)
      return {
        ...state,
        selectedIndex: Math.max(0, action.index),
      }

    case "MOVE":
      return {
        ...state,
        selectedIndex: Math.max(0, Math.min(state.prs.length - 1, state.selectedIndex + action.delta)),
      }

    case "OPEN_DISCOVERY":
      return {
        ...state,
        discoveryVisible: true,
        // Keep existing query so filter is still visible
      }

    case "CLOSE_DISCOVERY":
      return {
        ...state,
        discoveryVisible: false,
        // Keep the query - Escape just closes the bar, doesn't clear filter
        // User presses Escape again (when bar closed) to clear filter
      }

    case "ACCEPT_DISCOVERY":
      return {
        ...state,
        discoveryVisible: false,
        // Keep the query - filter stays active
      }

    case "SET_DISCOVERY_QUERY": {
      // Update both the global query and the current tab's filter
      // Note: title is computed at render time with config for alias lookup
      const tabs = state.tabs.map((t: Tab) =>
        t.id === state.activeTabId
          ? { ...t, filterQuery: action.query }
          : t
      )
      return {
        ...state,
        discoveryQuery: action.query,
        tabs,
      }
    }

    case "SHOW_MESSAGE":
      return {
        ...state,
        message: action.message,
      }

    case "CLEAR_MESSAGE":
      return {
        ...state,
        message: null,
      }

    // Preview actions (spec 014)
    case "TOGGLE_PREVIEW": {
      // Toggle preview on/off, keeping last position (default to right)
      return {
        ...state,
        previewPosition: state.previewPosition ? null : "right",
        previewScrollOffset: 0,
      }
    }

    case "CYCLE_PREVIEW_POSITION": {
      // Cycle position: right -> bottom -> right (only when preview is on)
      if (!state.previewPosition) return state
      return {
        ...state,
        previewPosition: state.previewPosition === "right" ? "bottom" : "right",
        previewScrollOffset: 0,
      }
    }

    case "SET_PREVIEW_CACHE": {
      const newCache = new Map(state.previewCache)
      newCache.set(action.key, action.data)
      return { ...state, previewCache: newCache }
    }

    case "SET_PREVIEW_LOADING":
      return { ...state, previewLoading: action.key }

    case "CLEAR_PREVIEW_CACHE":
      return { ...state, previewCache: new Map() }

    case "SCROLL_PREVIEW":
      return {
        ...state,
        previewScrollOffset: Math.max(0, state.previewScrollOffset + action.delta),
      }

    // Command palette actions (spec 010)
    case "OPEN_COMMAND_PALETTE":
      return {
        ...state,
        commandPaletteVisible: true,
      }

    case "CLOSE_COMMAND_PALETTE":
      return {
        ...state,
        commandPaletteVisible: false,
      }

    // Optimistic PR updates
    case "UPDATE_PR": {
      const prs = state.prs.map((pr) =>
        pr.url === action.url ? { ...pr, ...action.updates } : pr
      )
      return { ...state, prs }
    }

    case "REMOVE_PR": {
      const prs = state.prs.filter((pr) => pr.url !== action.url)
      return {
        ...state,
        prs,
        // Adjust selection if needed
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, prs.length - 1)),
      }
    }

    // Column visibility
    case "TOGGLE_COLUMN": {
      const columnVisibility = {
        ...state.columnVisibility,
        [action.column]: !state.columnVisibility[action.column],
      }
      return { ...state, columnVisibility }
    }

    // Tab actions (spec 011)
    case "DUPLICATE_TAB": {
      const currentTab = state.tabs.find((t: Tab) => t.id === state.activeTabId)
      if (!currentTab) return state

      const newTab = duplicateTab(currentTab)
      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      }
    }

    case "CLOSE_TAB": {
      // Can't close last tab
      if (state.tabs.length <= 1) return state

      const closingIndex = state.tabs.findIndex((t: Tab) => t.id === action.tabId)
      const newTabs = state.tabs.filter((t: Tab) => t.id !== action.tabId)
      const needNewActive = state.activeTabId === action.tabId

      // Switch to adjacent tab (prefer left, fallback to first)
      let newActiveId = state.activeTabId
      if (needNewActive) {
        const newIndex = Math.min(closingIndex, newTabs.length - 1)
        newActiveId = newTabs[newIndex].id
      }

      // Load the new active tab's filter and selection
      const newActiveTab = newTabs.find((t: Tab) => t.id === newActiveId)

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveId,
        discoveryQuery: newActiveTab?.filterQuery ?? "",
        selectedIndex: newActiveTab?.selectedIndex ?? 0,
      }
    }

    case "SWITCH_TAB": {
      const tab = state.tabs.find((t: Tab) => t.id === action.tabId)
      if (!tab || tab.id === state.activeTabId) return state

      // Save current tab's selection before switching
      const tabs = state.tabs.map((t: Tab) =>
        t.id === state.activeTabId
          ? { ...t, selectedIndex: state.selectedIndex }
          : t
      )

      return {
        ...state,
        tabs,
        activeTabId: action.tabId,
        discoveryQuery: tab.filterQuery,
        selectedIndex: tab.selectedIndex,
      }
    }

    case "UPDATE_TAB_NOTIFICATION": {
      const tabs = state.tabs.map((t: Tab) =>
        t.id === action.tabId ? { ...t, hasNotification: action.hasNotification } : t
      )
      return { ...state, tabs }
    }

    case "LOAD_TABS": {
      const activeTab = action.tabs.find((t: Tab) => t.id === action.activeTabId)
      return {
        ...state,
        tabs: action.tabs,
        activeTabId: action.activeTabId,
        discoveryQuery: activeTab?.filterQuery ?? "",
        selectedIndex: activeTab?.selectedIndex ?? 0,
      }
    }

    case "STORE_CLOSED_TAB": {
      return {
        ...state,
        closedTab: { tab: action.tab, index: action.index },
      }
    }

    case "UNDO_CLOSE_TAB": {
      if (!state.closedTab) return state

      const { tab, index } = state.closedTab
      // Insert tab back at original position (or end if out of bounds)
      const insertIndex = Math.min(index, state.tabs.length)
      const newTabs = [
        ...state.tabs.slice(0, insertIndex),
        tab,
        ...state.tabs.slice(insertIndex),
      ]

      return {
        ...state,
        tabs: newTabs,
        activeTabId: tab.id,
        discoveryQuery: tab.filterQuery,
        closedTab: null,
      }
    }

    case "CLOSE_OTHER_TABS": {
      // Keep only the active tab
      const activeTab = state.tabs.find((t: Tab) => t.id === state.activeTabId)
      if (!activeTab) return state

      return {
        ...state,
        tabs: [activeTab],
        closedTab: null, // Can't undo closing multiple tabs
      }
    }

    case "RENAME_TAB": {
      const tabs = state.tabs.map((t: Tab) =>
        t.id === action.tabId
          ? { ...t, titleOverride: action.title || undefined }
          : t
      )
      return { ...state, tabs }
    }

    default:
      return state
  }
}
