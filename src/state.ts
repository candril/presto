/**
 * Application state management
 */

import type { AppState, PR, View, PreviewPosition, ColumnId } from "./types"
import { loadCache, getColumnVisibility } from "./cache"

/** Action types for the reducer */
export type AppAction =
  | { type: "SET_VIEW"; view: View }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_REFRESHING"; refreshing: boolean }
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

/** Create initial state, loading persisted filter from cache */
export function createInitialState(): AppState {
  const cache = loadCache()
  return {
    view: "list",
    prs: [],
    selectedIndex: 0,
    loading: true,
    refreshing: false,
    error: null,
    discoveryVisible: false,
    discoveryQuery: cache.filterQuery || "",
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

    case "SET_DISCOVERY_QUERY":
      return {
        ...state,
        discoveryQuery: action.query,
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

    default:
      return state
  }
}
