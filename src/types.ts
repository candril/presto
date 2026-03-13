// View modes for the application
export type View = "list" | "detail"

// Application state
export interface AppState {
  view: View
  loading: boolean
  error: string | null
}

// PR types (will be expanded in spec 002)
export interface PullRequest {
  number: number
  title: string
  author: string
  state: "open" | "closed" | "merged"
  isDraft: boolean
  createdAt: string
  updatedAt: string
}
