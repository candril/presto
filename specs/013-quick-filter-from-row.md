# Quick Filter from Row

**Status**: Cancelled (not needed - discovery bar covers this use case)

## Description

When viewing the PR list, quickly filter by the current row's author, repo, or other attributes without opening the discovery bar and typing. Press a key combo on any PR row to instantly filter the list to show similar PRs.

This complements spec 005 (Smart Discovery) by providing a faster path for the common case: "show me more PRs like this one."

## Out of Scope

- Filtering by multiple attributes at once (use discovery bar for complex queries)
- Saving quick filters as presets
- Filtering by PR state from row (use `state:` syntax in discovery)

## Capabilities

### P1 - Must Have

- **Filter by author**: `f a` on a PR row filters to that author's PRs
- **Filter by repo**: `f r` on a PR row filters to that repo's PRs
- **Clear filters**: `f c` or `Escape` clears all active filters
- **Visual feedback**: Show active filter in status bar with author/repo name
- **Combine with existing**: Quick filters integrate with discovery bar state

### P2 - Should Have

- **Star author shortcut**: `f s` stars/unstars the current PR's author (alias for `s`)
- **Filter and star**: `f S` (shift) stars author AND filters to them
- **Filter toggle**: Pressing same filter again clears it (e.g., `f a` twice = clear author filter)
- **Show filter count**: Display "Showing X of Y PRs" when filter active

### P3 - Nice to Have

- **Filter by label**: `f l` shows label picker for current PR's labels, filter by selection
- **Filter by branch base**: `f b` filters to PRs targeting same base branch
- **Filter history**: `f h` shows recent quick filters for quick re-application
- **Compound quick filter**: `f a r` filters by both author AND repo of current row

## Technical Notes

### Key Binding Design

Using `f` as a prefix key (like vim's `f` for find character):

| Key | Action | Example Result |
|-----|--------|----------------|
| `f a` | Filter by author | `@stefanw` |
| `f r` | Filter by repo | `repo:presto` |
| `f c` | Clear all filters | (no filter) |
| `f s` | Star/unstar author | Toggle star |
| `f S` | Star + filter author | Star + `@stefanw` |

Alternative considered: Using modifier keys (`Ctrl+a`, `Ctrl+r`) but `f` prefix is more discoverable and vim-like.

### State Changes

```typescript
// src/state.ts additions
export interface AppState {
  // ... existing
  
  /** Pending prefix key (e.g., "f" waiting for second key) */
  pendingPrefix: string | null
  
  /** Quick filter state separate from discovery query */
  quickFilter: QuickFilter | null
}

export interface QuickFilter {
  type: "author" | "repo"
  value: string
  /** Display label for status bar */
  label: string
}

export type AppAction =
  // ... existing
  | { type: "SET_PENDING_PREFIX"; prefix: string | null }
  | { type: "SET_QUICK_FILTER"; filter: QuickFilter | null }
  | { type: "CLEAR_FILTERS" }
```

### Keyboard Handler

```typescript
// src/hooks/useQuickFilter.ts
import { useKeyboard } from "@opentui/react"
import { useCallback, useEffect } from "react"
import type { AppState, AppAction, QuickFilter } from "../state"
import type { PR } from "../types"

interface UseQuickFilterOptions {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  selectedPR: PR | null
  onStarAuthor: (author: string) => void
}

export function useQuickFilter({
  state,
  dispatch,
  selectedPR,
  onStarAuthor,
}: UseQuickFilterOptions) {
  
  // Clear pending prefix after timeout
  useEffect(() => {
    if (state.pendingPrefix) {
      const timer = setTimeout(() => {
        dispatch({ type: "SET_PENDING_PREFIX", prefix: null })
      }, 1500) // 1.5s timeout for second key
      return () => clearTimeout(timer)
    }
  }, [state.pendingPrefix, dispatch])

  useKeyboard((key) => {
    // Don't handle if discovery bar is open or in input mode
    if (state.discoveryVisible || state.inputFocused) return

    // Handle pending prefix
    if (state.pendingPrefix === "f") {
      dispatch({ type: "SET_PENDING_PREFIX", prefix: null })
      
      if (!selectedPR) return
      
      switch (key.name) {
        case "a": // Filter by author
          dispatch({
            type: "SET_QUICK_FILTER",
            filter: {
              type: "author",
              value: selectedPR.author.login,
              label: `@${selectedPR.author.login}`,
            },
          })
          break
          
        case "r": // Filter by repo
          const repoName = selectedPR.repository.nameWithOwner
          dispatch({
            type: "SET_QUICK_FILTER",
            filter: {
              type: "repo",
              value: repoName,
              label: `repo:${repoName.split("/")[1]}`,
            },
          })
          break
          
        case "c": // Clear filters
          dispatch({ type: "CLEAR_FILTERS" })
          break
          
        case "s": // Star author
          onStarAuthor(selectedPR.author.login)
          break
          
        case "S": // Star + filter
          onStarAuthor(selectedPR.author.login)
          dispatch({
            type: "SET_QUICK_FILTER",
            filter: {
              type: "author",
              value: selectedPR.author.login,
              label: `@${selectedPR.author.login}`,
            },
          })
          break
      }
      return
    }

    // Start prefix sequence
    if (key.name === "f") {
      dispatch({ type: "SET_PENDING_PREFIX", prefix: "f" })
      return
    }

    // Escape clears filters (without prefix)
    if (key.name === "escape" && state.quickFilter) {
      dispatch({ type: "CLEAR_FILTERS" })
      return
    }
  })
}
```

### Filter Application

```typescript
// src/hooks/useFilteredPRs.ts
import { useMemo } from "react"
import type { PR } from "../types"
import type { QuickFilter } from "../state"
import type { ParsedFilter } from "../discovery/parser"

interface FilterOptions {
  prs: PR[]
  quickFilter: QuickFilter | null
  discoveryFilter: ParsedFilter | null
}

export function useFilteredPRs({ prs, quickFilter, discoveryFilter }: FilterOptions): PR[] {
  return useMemo(() => {
    let filtered = prs

    // Apply quick filter first
    if (quickFilter) {
      filtered = filtered.filter((pr) => {
        switch (quickFilter.type) {
          case "author":
            return pr.author.login.toLowerCase() === quickFilter.value.toLowerCase()
          case "repo":
            return pr.repository.nameWithOwner.toLowerCase() === quickFilter.value.toLowerCase()
          default:
            return true
        }
      })
    }

    // Then apply discovery filter (if any)
    if (discoveryFilter) {
      filtered = applyFilter(filtered, discoveryFilter)
    }

    return filtered
  }, [prs, quickFilter, discoveryFilter])
}
```

### Status Bar Integration

```tsx
// src/components/StatusBar.tsx
interface StatusBarProps {
  quickFilter: QuickFilter | null
  pendingPrefix: string | null
  totalPRs: number
  visiblePRs: number
}

export function StatusBar({ quickFilter, pendingPrefix, totalPRs, visiblePRs }: StatusBarProps) {
  return (
    <box height={1} backgroundColor={theme.statusBg}>
      {/* Pending prefix indicator */}
      {pendingPrefix && (
        <text fg={theme.warning}>
          {pendingPrefix}- (a: author, r: repo, c: clear)
        </text>
      )}
      
      {/* Active filter indicator */}
      {!pendingPrefix && quickFilter && (
        <text>
          <span fg={theme.primary}>Filter: {quickFilter.label}</span>
          <span fg={theme.textDim}> ({visiblePRs}/{totalPRs})</span>
          <span fg={theme.textMuted}> [Esc to clear]</span>
        </text>
      )}
      
      {/* Normal hints when no filter */}
      {!pendingPrefix && !quickFilter && (
        <text fg={theme.textDim}>
          f: quick filter  /: search  ?: help
        </text>
      )}
    </box>
  )
}
```

### Integration with Discovery Bar

When quick filter is active and user opens discovery bar:
1. Pre-populate discovery query with quick filter value
2. Allow user to modify/combine with other filters
3. Clear quick filter state (discovery takes over)

```typescript
// In App.tsx
const handleOpenDiscovery = () => {
  // Transfer quick filter to discovery query
  if (state.quickFilter) {
    dispatch({ 
      type: "OPEN_DISCOVERY",
      initialQuery: state.quickFilter.label 
    })
    dispatch({ type: "SET_QUICK_FILTER", filter: null })
  } else {
    dispatch({ type: "OPEN_DISCOVERY" })
  }
}
```

## File Structure

```
src/
├── state.ts                    # Add QuickFilter, pendingPrefix
├── hooks/
│   ├── useQuickFilter.ts       # New: quick filter keyboard handler
│   └── useFilteredPRs.ts       # Update: integrate quick filter
├── components/
│   └── StatusBar.tsx           # Update: show filter state
└── App.tsx                     # Wire up quick filter hook
```

## User Experience Flow

1. User navigates to a PR in the list
2. User presses `f` - status bar shows `f- (a: author, r: repo, c: clear)`
3. User presses `a` - list instantly filters to that author
4. Status bar shows `Filter: @username (5/23) [Esc to clear]`
5. User can:
   - Press `Esc` to clear and see all PRs again
   - Press `/` to open discovery with `@username` pre-filled
   - Press `f a` again on different PR to switch filter
   - Press `f c` to clear filter

## Relationship to Other Specs

- **005-smart-discovery.md**: Quick filter is a fast-path to discovery. Opening discovery bar transfers quick filter state.
- **008-keyboard-shortcuts.md**: `f` prefix should be documented in help overlay.
- **012-starred-authors-filter.md**: Quick filter respects starred-only repo settings.
