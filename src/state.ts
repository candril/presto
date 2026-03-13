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
  | { type: "SELECT"; index: number }
  | { type: "MOVE"; delta: number }

/** Initial application state */
export const initialState: AppState = {
  view: "list",
  prs: [],
  selectedIndex: 0,
  loading: true,
  error: null,
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

    default:
      return state
  }
}
