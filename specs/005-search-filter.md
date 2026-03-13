# Search & Filter

**Status**: Ready

## Description

Filter and search through pull requests. Quick filtering by common criteria (author, repo, status) and free-text search across PR titles.

## Out of Scope

- Saved filters/queries
- Advanced query syntax (GitHub search syntax)
- Filter persistence across sessions

## Capabilities

### P1 - Must Have

- **Text search**: `/` to open search, filter by title match
- **Clear search**: `Escape` to clear search
- **Live filtering**: Update list as user types

### P2 - Should Have

- **Quick filters**: 
  - `1` - My PRs (authored by me)
  - `2` - Review requests (assigned to me)
  - `3` - All PRs
- **Status filter**: Show only open/closed/draft
- **Filter indicator**: Show active filters in status bar

### P3 - Nice to Have

- **Fuzzy matching**: Fuzzy search on title
- **Multi-repo**: Filter by repository
- **Sort options**: Sort by date, activity, etc.

## Technical Notes

### Search State

```typescript
// src/state.ts
export interface AppState {
  // ... existing
  searchQuery: string
  searchActive: boolean
  quickFilter: "all" | "mine" | "review-requested"
  statusFilter: "all" | "open" | "closed" | "draft"
}

export type AppAction =
  // ... existing
  | { type: "SET_SEARCH"; query: string }
  | { type: "TOGGLE_SEARCH" }
  | { type: "SET_QUICK_FILTER"; filter: "all" | "mine" | "review-requested" }
  | { type: "SET_STATUS_FILTER"; filter: "all" | "open" | "closed" | "draft" }
```

### Filtering Logic

```typescript
// src/hooks/useFilteredPRs.ts
import { useMemo } from "react"
import type { PR } from "../providers/github"
import type { AppState } from "../state"

export function useFilteredPRs(prs: PR[], state: AppState): PR[] {
  return useMemo(() => {
    let filtered = [...prs]
    
    // Quick filter
    switch (state.quickFilter) {
      case "mine":
        filtered = filtered.filter(pr => pr.author.login === state.currentUser)
        break
      case "review-requested":
        // These would be fetched separately, but filter locally too
        filtered = filtered.filter(pr => pr.reviewRequests?.some(r => r.login === state.currentUser))
        break
    }
    
    // Status filter
    if (state.statusFilter !== "all") {
      filtered = filtered.filter(pr => {
        if (state.statusFilter === "draft") return pr.isDraft
        if (state.statusFilter === "open") return pr.state === "OPEN" && !pr.isDraft
        if (state.statusFilter === "closed") return pr.state === "CLOSED" || pr.state === "MERGED"
        return true
      })
    }
    
    // Text search
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase()
      filtered = filtered.filter(pr => 
        pr.title.toLowerCase().includes(query) ||
        pr.repository.nameWithOwner.toLowerCase().includes(query) ||
        pr.author.login.toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [prs, state.quickFilter, state.statusFilter, state.searchQuery])
}
```

### Search Input Component

```tsx
// src/components/SearchInput.tsx
import { theme } from "../theme"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  focused: boolean
}

export function SearchInput({ value, onChange, onClose, focused }: SearchInputProps) {
  return (
    <box height={1} width="100%" backgroundColor={theme.headerBg} paddingLeft={1}>
      <text fg={theme.primary}>/</text>
      <input
        value={value}
        onChange={onChange}
        placeholder="Search PRs..."
        focused={focused}
        width={40}
        backgroundColor={theme.headerBg}
        textColor={theme.text}
      />
    </box>
  )
}
```

### Keyboard Integration

```tsx
// In App.tsx
useKeyboard((key) => {
  // Search mode
  if (state.searchActive) {
    if (key.name === "escape") {
      dispatch({ type: "SET_SEARCH", query: "" })
      dispatch({ type: "TOGGLE_SEARCH" })
    }
    return  // Let input handle other keys
  }
  
  // Quick filters
  if (key.name === "1") {
    dispatch({ type: "SET_QUICK_FILTER", filter: "mine" })
    return
  }
  if (key.name === "2") {
    dispatch({ type: "SET_QUICK_FILTER", filter: "review-requested" })
    return
  }
  if (key.name === "3") {
    dispatch({ type: "SET_QUICK_FILTER", filter: "all" })
    return
  }
  
  // Open search
  if (key.name === "/" || key.name === "f" && key.ctrl) {
    dispatch({ type: "TOGGLE_SEARCH" })
    return
  }
  
  // ... other handlers
})
```

### Status Bar Updates

```tsx
// Show active filters
function buildHints(state: AppState): string[] {
  const hints = []
  
  if (state.quickFilter !== "all") {
    hints.push(`Filter: ${state.quickFilter}`)
  }
  if (state.statusFilter !== "all") {
    hints.push(`Status: ${state.statusFilter}`)
  }
  if (state.searchQuery) {
    hints.push(`Search: "${state.searchQuery}"`)
  }
  
  hints.push("/: search", "1-3: filter", "q: quit")
  
  return hints
}
```

## File Structure

```
src/
├── hooks/
│   └── useFilteredPRs.ts    # Filter logic hook
├── components/
│   └── SearchInput.tsx      # Search input component
├── state.ts                 # Add search/filter state
└── App.tsx                  # Add keyboard handlers
```
