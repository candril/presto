# PR Marking & Recent PRs

**Status**: Draft

## Description

Two related features for quick PR access:

1. **Marked PRs**: Manually mark/pin PRs with `m` for quick access. Filter to marked only with `Ctrl+M`.
2. **Recent PRs**: Automatically track PRs opened via Enter or pasted URLs. Filter to recent only with `Ctrl+R`.

Both features bypass all repo visibility settings (hidden repos, disabled repos, starredOnly filters) when filtering. Both show subtle visual indicators in the PR list.

## Out of Scope

- Multiple mark categories/colors (just a single "marked" state)
- Auto-unmarking when PR is merged/closed
- Cloud sync of marked/recent PRs
- Configurable recent PR limit (hardcoded to 30)
- Syncing recent PRs with riff (P2 for riff integration)

## Capabilities

### P1 - Must Have

#### Marking
- **Mark toggle**: Press `m` on a PR to toggle mark status
- **Marked filter**: `Ctrl+M` toggles "marked PRs only" view
- **Persistence**: Store marked PRs in history.json, keyed by `owner/repo#number`
- **Feedback message**: Show "Marked" / "Unmarked" message when toggling

#### Recent PRs
- **Track on open**: Record PR when opened via any method:
  - Enter key (default tool)
  - `o` - open in browser
  - `r` - open in riff
  - Pasted GitHub URL
- **Recent filter**: `Ctrl+R` toggles "recent PRs only" view
- **Limit**: Keep last 30 recently opened PRs (existing `recentlyViewed` in history)

#### Shared
- **Visual indicators**: Subtle indicators in PR list for marked and recent PRs
- **Bypass repo settings**: Both filters ignore hidden repos, disabled repos, `starredOnly`

## Technical Notes

### Visual Indicators

Use subtle, non-intrusive indicators that don't add visual noise:

```
Option A: Colored dot before PR number (recommended)
  ●#123  Add user authentication       (marked - accent color)
  ○#456  Fix pagination bug            (recent - dim color)
  ●#789  Update dependencies           (both - accent, maybe different icon)

Option B: Background tint on the row
  Marked: very subtle accent background tint
  Recent: very subtle gray background tint

Option C: Icon in dedicated column
  ◆ #123  Add user authentication      (marked)
  ◇ #456  Fix pagination bug           (recent)
```

Suggested colors:
- Marked: `theme.accent` or yellow/gold (`#f9e2af`)
- Recent: `theme.textDim` or subtle blue (`#89b4fa` dimmed)

### History Schema

The existing `recentlyViewed` field already tracks recent PRs. Add `markedPRs`:

```typescript
// src/history/schema.ts
export interface History {
  // ... existing fields
  starredAuthors: string[]
  recentAuthors: RecentAuthor[]
  recentlyViewed: RecentPR[]      // Already exists! Use this for recent
  recentFilters: string[]
  
  /** Marked/pinned PRs, keyed by "owner/repo#number" */
  markedPRs: string[]             // NEW
}

// Update limit for recent PRs
export const HISTORY_LIMITS = {
  recentAuthors: 20,
  recentlyViewed: 30,  // Changed from 50 to 30
  recentFilters: 10,
}
```

### Mark Operations

```typescript
// src/history/loader.ts

/** Toggle mark status for a PR */
export function toggleMarkPR(history: History, prKey: string): History {
  const marked = new Set(history.markedPRs ?? [])
  if (marked.has(prKey)) {
    marked.delete(prKey)
  } else {
    marked.add(prKey)
  }
  return { ...history, markedPRs: [...marked] }
}

/** Check if a PR is marked */
export function isPRMarked(history: History, prKey: string): boolean {
  return history.markedPRs?.includes(prKey) ?? false
}

/** Check if a PR is recent */
export function isPRRecent(history: History, prKey: string): boolean {
  const [repo, numStr] = prKey.split("#")
  const number = parseInt(numStr, 10)
  return history.recentlyViewed.some(r => r.repo === repo && r.number === number)
}

/** Get PR key from PR object */
export function getPRKey(pr: PR): string {
  return `${getRepoName(pr)}#${pr.number}`
}

/** Clear all marks */
export function clearAllMarks(history: History): History {
  return { ...history, markedPRs: [] }
}

/** Clear recent history */
export function clearRecentPRs(history: History): History {
  return { ...history, recentlyViewed: [] }
}
```

### Recording Recent PRs

The existing `recordPRView` function should be called whenever a PR is opened:

```typescript
// Helper to record and open
function recordAndOpen(pr: PR, openFn: () => Promise<void>) {
  // Record to recent history BEFORE opening
  const newHistory = recordPRView(history, {
    repo: getRepoName(pr),
    number: pr.number,
    title: pr.title,
    author: pr.author.login,
  })
  setHistory(newHistory)
  saveHistory(newHistory)
  
  // Then open
  await openFn()
}

// All open actions should record:
// - Enter (default tool)
// - 'o' (browser)
// - 'r' (riff)
// - Pasted URL
```

### App State Update

```typescript
// src/types.ts
export interface AppState {
  // ... existing
  
  /** Active special filter: null | "marked" | "recent" */
  specialFilter: "marked" | "recent" | null
}
```

### State Reducer Update

```typescript
// src/state.ts
export type AppAction =
  // ... existing
  | { type: "SET_SPECIAL_FILTER"; filter: "marked" | "recent" | null }
  | { type: "TOGGLE_SPECIAL_FILTER"; filter: "marked" | "recent" }

case "SET_SPECIAL_FILTER":
  return { ...state, specialFilter: action.filter }

case "TOGGLE_SPECIAL_FILTER":
  return {
    ...state,
    specialFilter: state.specialFilter === action.filter ? null : action.filter,
  }
```

### Keyboard Handling

```typescript
// In useKeyboardNav.ts or commands

// Mark current PR
if (key.name === "m" && selectedPR) {
  const prKey = getPRKey(selectedPR)
  const newHistory = toggleMarkPR(history, prKey)
  setHistory(newHistory)
  saveHistory(newHistory)
  
  const isMarked = isPRMarked(newHistory, prKey)
  dispatch({
    type: "SET_MESSAGE",
    message: isMarked ? "Marked" : "Unmarked",
  })
  return
}

// Toggle marked-only view (Ctrl+M)
if (key.ctrl && key.name === "m") {
  dispatch({ type: "TOGGLE_SPECIAL_FILTER", filter: "marked" })
  return
}

// Toggle recent-only view (Ctrl+R)  
if (key.ctrl && key.name === "r") {
  dispatch({ type: "TOGGLE_SPECIAL_FILTER", filter: "recent" })
  return
}
```

### Filtering Integration

```typescript
// src/hooks/useFiltering.ts

export function useFiltering({
  prs,
  discoveryQuery,
  config,
  history,
  specialFilter,  // "marked" | "recent" | null
}: FilteringOptions) {
  
  const finalPRs = useMemo(() => {
    // Special filters bypass all repo settings
    if (specialFilter === "marked") {
      return prs.filter(pr => {
        const prKey = getPRKey(pr)
        return isPRMarked(history, prKey)
      })
    }
    
    if (specialFilter === "recent") {
      // Filter to recent and preserve recency order
      const recentKeys = new Set(
        history.recentlyViewed.map(r => `${r.repo}#${r.number}`)
      )
      const recentPRs = prs.filter(pr => recentKeys.has(getPRKey(pr)))
      
      // Sort by recency (most recent first)
      const orderMap = new Map(
        history.recentlyViewed.map((r, i) => [`${r.repo}#${r.number}`, i])
      )
      return recentPRs.sort((a, b) => {
        const orderA = orderMap.get(getPRKey(a)) ?? 999
        const orderB = orderMap.get(getPRKey(b)) ?? 999
        return orderA - orderB
      })
    }
    
    // Normal filtering with repo settings
    return applyStarredOnlyFilter(filteredByQuery, filter, context)
  }, [specialFilter, prs, history, ...])
}
```

### PR List Visual Indicator

```tsx
// src/components/PRList.tsx

function PRRow({ pr, selected, history }: PRRowProps) {
  const prKey = getPRKey(pr)
  const isMarked = isPRMarked(history, prKey)
  const isRecent = isPRRecent(history, prKey)
  
  // Determine indicator
  let indicator = " "  // Default: space for alignment
  let indicatorColor = theme.textDim
  
  if (isMarked) {
    indicator = "●"
    indicatorColor = theme.accent  // or theme.yellow
  } else if (isRecent) {
    indicator = "○"
    indicatorColor = theme.textMuted
  }
  
  return (
    <box flexDirection="row">
      <text fg={indicatorColor}>{indicator}</text>
      <text fg={theme.textDim}>#{pr.number}</text>
      <text> {pr.title}</text>
      {/* ... rest of row */}
    </box>
  )
}
```

### Header/Status Bar Integration

```tsx
// Show active filter in header
function Header({ specialFilter, markedCount, recentCount }) {
  return (
    <box>
      <text>presto</text>
      {specialFilter === "marked" && (
        <text fg={theme.accent}> ● Marked ({markedCount})</text>
      )}
      {specialFilter === "recent" && (
        <text fg={theme.textMuted}> ○ Recent ({recentCount})</text>
      )}
    </box>
  )
}
```

## File Structure

```
src/
├── history/
│   ├── schema.ts          # Add markedPRs to History
│   └── loader.ts          # Add mark operations, isPRRecent helper
├── types.ts               # Add specialFilter to AppState  
├── state.ts               # Add TOGGLE_SPECIAL_FILTER action
├── hooks/
│   ├── useKeyboardNav.ts  # Handle 'm', 'Ctrl+M', 'Ctrl+R', record on Enter
│   └── useFiltering.ts    # Add special filter logic
└── components/
    ├── PRList.tsx         # Add visual indicators to rows
    ├── Header.tsx         # Show active filter mode
    └── StatusBar.tsx      # Show filter hints
```

## UI Examples

### Normal List with Indicators
```
 ●#123  Add user authentication       @alice   ✓  ●  2h   (marked)
  #456  Fix pagination bug            @bob     ✓  ●  1d   (neither)
 ○#789  Update dependencies           @alice   ⏳  ○  3h   (recent)
 ●#101  Refactor auth module          @carol   ✓  ●  4h   (marked, also recent)
```

### Marked-Only Mode (Ctrl+M)
```
presto ● Marked (2)                                 Ctrl+M: exit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  #123  Add user authentication       @alice   ✓  ●  2h
  #101  Refactor auth module          @carol   ✓  ●  4h
```

### Recent-Only Mode (Ctrl+R)
```
presto ○ Recent (3)                                 Ctrl+R: exit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  #789  Update dependencies           @alice   ⏳  ○  3h   (opened 5m ago)
  #101  Refactor auth module          @carol   ✓  ●  4h   (opened 1h ago)
  #555  Add tests                     @bob     ✓  ●  2d   (opened 2h ago)
```

### Feedback Messages
```
Marked
Unmarked
```

## Keyboard Summary

| Key | Action |
|-----|--------|
| `m` | Toggle mark on selected PR |
| `Ctrl+M` | Toggle marked-only filter |
| `Ctrl+R` | Toggle recent-only filter |
| `Enter` | Open PR (also records to recent) |
