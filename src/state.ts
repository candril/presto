import type { AppState, View } from "./types"

// Action types
export type AppAction =
  | { type: "SET_VIEW"; view: View }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }

// Initial state
export const initialState: AppState = {
  view: "list",
  loading: false,
  error: null,
}

// Reducer
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view }
    case "SET_LOADING":
      return { ...state, loading: action.loading }
    case "SET_ERROR":
      return { ...state, error: action.error }
    default:
      return state
  }
}
