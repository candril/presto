/**
 * Application state management
 */

import type { AppState, PR, View } from "./types"

/** Action types for the reducer */
export type AppAction =
  | { type: "SET_VIEW"; view: View }
  | { type: "SET_LOADING"; loading: boolean }
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

/** Initial application state */
export const initialState: AppState = {
  view: "list",
  prs: [],
  selectedIndex: 0,
  loading: true,
  error: null,
  discoveryVisible: false,
  discoveryQuery: "",
  message: null,
}

/** State reducer */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view }

    case "SET_LOADING":
      return { ...state, loading: action.loading }

    case "SET_ERROR":
      return { ...state, error: action.error, loading: false }

    case "SET_PRS":
      return {
        ...state,
        prs: action.prs,
        loading: false,
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
      return {
        ...state,
        selectedIndex: Math.max(0, Math.min(state.prs.length - 1, action.index)),
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
        discoveryQuery: "",
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

    default:
      return state
  }
}
