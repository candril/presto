# PR List

**Status**: Done

## Description

Fetch and display a list of pull requests from GitHub. The main view of presto showing PRs with their status indicators, allowing navigation and selection.

## Out of Scope

- PR detail view (spec 003)
- Opening in external tools (spec 004)
- Advanced search/filter UI (spec 005)

## Capabilities

### P1 - Must Have

- **Fetch PRs**: Use `gh pr list` to get PRs from configured repos
- **Display list**: Show PRs in a scrollable list
- **PR info**: Title, repo, author, age, status badges
- **Navigation**: `j`/`k` or arrows to move, selection highlight
- **Loading state**: Show spinner while fetching
- **Error handling**: Display fetch errors

### P2 - Should Have

- **CI status**: Show check status (pass/fail/pending icons)
- **Review status**: Show review state (approved, changes, pending)
- **Auto-refresh**: Refresh list periodically or on demand
- **Multiple sources**: PRs from multiple repos

### P3 - Nice to Have

- **Relative time**: "2 hours ago" instead of timestamp
- **Compact/expanded modes**: Toggle detail level
- **Pagination**: Load more PRs on scroll

## Technical Notes

### GitHub Provider

```typescript
// src/providers/github.ts
import { $ } from "bun"

export interface PR {
  number: number
  title: string
  author: { login: string }
  repository: { nameWithOwner: string }
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  createdAt: string
  updatedAt: string
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null
  statusCheckRollup?: {
    state: "SUCCESS" | "FAILURE" | "PENDING" | "ERROR"
  }
}

export async function listPRs(repo?: string): Promise<PR[]> {
  const args = ["pr", "list", "--json", 
    "number,title,author,repository,state,isDraft,createdAt,updatedAt,reviewDecision,statusCheckRollup"
  ]
  if (repo) args.push("-R", repo)
  
  const result = await $`gh ${args}`.json()
  return result
}

export async function listMyPRs(): Promise<PR[]> {
  const result = await $`gh pr list --author @me --json number,title,author,repository,state,isDraft,createdAt,updatedAt,reviewDecision,statusCheckRollup`.json()
  return result
}

export async function listReviewRequests(): Promise<PR[]> {
  const result = await $`gh pr list --search "review-requested:@me" --json number,title,author,repository,state,isDraft,createdAt,updatedAt,reviewDecision,statusCheckRollup`.json()
  return result
}
```

### PR List Component

```tsx
// src/components/PRList.tsx
import { theme } from "../theme"
import type { PR } from "../providers/github"

interface PRListProps {
  prs: PR[]
  selectedIndex: number
  onSelect: (index: number) => void
}

export function PRList({ prs, selectedIndex, onSelect }: PRListProps) {
  return (
    <scrollbox width="100%" height="100%">
      <box flexDirection="column">
        {prs.map((pr, index) => (
          <PRRow
            key={`${pr.repository.nameWithOwner}#${pr.number}`}
            pr={pr}
            selected={index === selectedIndex}
          />
        ))}
      </box>
    </scrollbox>
  )
}

function PRRow({ pr, selected }: { pr: PR; selected: boolean }) {
  const stateColor = pr.isDraft
    ? theme.prDraft
    : pr.state === "MERGED"
    ? theme.prMerged
    : pr.state === "CLOSED"
    ? theme.prClosed
    : theme.prOpen

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={selected ? theme.headerBg : undefined}
      paddingLeft={1}
    >
      <text>
        <span fg={stateColor}>{pr.isDraft ? "D" : pr.state[0]}</span>
        {" "}
        <span fg={theme.textDim}>#{pr.number}</span>
        {" "}
        <span fg={theme.text}>{pr.title}</span>
        {" "}
        <span fg={theme.textMuted}>{pr.repository.nameWithOwner}</span>
      </text>
    </box>
  )
}
```

### State Management

```typescript
// src/state.ts
import type { PR } from "./providers/github"

export type ViewMode = "list" | "detail"

export interface AppState {
  viewMode: ViewMode
  prs: PR[]
  selectedIndex: number
  loading: boolean
  error: string | null
}

export type AppAction =
  | { type: "SET_PRS"; prs: PR[] }
  | { type: "SELECT"; index: number }
  | { type: "MOVE"; delta: number }
  | { type: "SET_VIEW"; mode: ViewMode }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }

export const initialState: AppState = {
  viewMode: "list",
  prs: [],
  selectedIndex: 0,
  loading: true,
  error: null,
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PRS":
      return { ...state, prs: action.prs, loading: false, error: null }
    case "SELECT":
      return { ...state, selectedIndex: action.index }
    case "MOVE":
      return {
        ...state,
        selectedIndex: Math.max(0, Math.min(state.prs.length - 1, state.selectedIndex + action.delta)),
      }
    case "SET_VIEW":
      return { ...state, viewMode: action.mode }
    case "SET_LOADING":
      return { ...state, loading: action.loading }
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false }
    default:
      return state
  }
}
```

## File Structure

```
src/
├── providers/
│   └── github.ts        # GitHub API via gh CLI
├── components/
│   └── PRList.tsx       # PR list component
├── state.ts             # Updated with PR state
└── types.ts             # PR type definitions
```
