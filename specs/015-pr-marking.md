# PR Marking & Recent PRs

**Status**: Done

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
  - Enter key (default tool / riff)
  - `o` - open in browser
  - Pasted GitHub URL in filter bar (e.g., `https://github.com/owner/repo/pull/123`)
  - Pasted PR reference (e.g., `#123`, `repo#123`, `owner/repo#123`)
- **Recent filter**: `Ctrl+R` sets `@recent` filter
- **Limit**: Keep last 30 recently opened PRs (existing `recentlyViewed` in history)

#### Shared
- **Visual indicators**: Subtle indicators in PR list for marked and recent PRs
- **Bypass repo settings**: Both filters ignore hidden repos, disabled repos, `starredOnly`

## Technical Notes

### Visual Indicators

Use title text color to indicate PR status - subtle but noticeable:

| Status | Color | Hex |
|--------|-------|-----|
| **Marked** | Bright gold | `#e0af68` |
| **Just opened** (< 2h) | Brightest | `#c0caf5` |
| **Today** (< 24h) | Bright | `#a9b1d6` |
| **This week** | Semi-bright | `#787c99` |
| **Older / Never opened** | Dim | `#565f89` |

This approach:
- No extra columns or icons needed
- Naturally draws attention to marked PRs
- Shows recency gradient - recently opened PRs are brighter
- Unopened PRs fade into background until you interact with them
- Marked always takes priority (gold) regardless of recency
- PRs older than a week look the same as never opened

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
  const prKey = getPRKey(getRepoName(pr), pr.number)
  const isMarked = isPRMarked(history, prKey)
  const recencyLevel = getPRRecencyLevel(history, prKey)
  
  // Title color based on user interaction
  let titleColor = theme.textOlder
  if (isMarked) {
    titleColor = theme.warning  // gold - always priority
  } else {
    switch (recencyLevel) {
      case "justNow":   titleColor = theme.textJustNow; break   // < 2h
      case "today":     titleColor = theme.textToday; break     // < 24h
      case "thisWeek":  titleColor = theme.textThisWeek; break  // < 1 week
      case "older":     titleColor = theme.textOlder; break     // older/never
    }
  }
  
  return (
    <box>
      <text>
        {/* ... other columns ... */}
        <span fg={titleColor}>{title}</span>
        {/* ... */}
      </text>
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

### Normal List with Title Colors
```
(gold)   Add user authentication (#123)    ✓ ●  2h  @alice    (marked)
(dim)    Fix pagination bug (#456)         ✓ ●  1d  @bob      (never opened)
(bright) Update dependencies (#789)        ⏳ ○  3h  @alice    (opened 1h ago)
(medium) Refactor auth module (#101)       ✓ ●  4h  @carol    (opened yesterday)
```

Title brightness indicates recency:
- Gold = marked (always stands out)
- Brightest = just opened (< 2h)
- Bright = today
- Medium = this week
- Dim = older or never opened

### Marked-Only Mode (Ctrl+M)
```
PResto ● Marked (2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Add user authentication (#123)       ✓  ●  2h  @alice
  Refactor auth module (#101)          ✓  ●  4h  @carol
```

### Recent-Only Mode (Ctrl+R)
```
PResto ○ Recent (3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Update dependencies (#789)           ⏳  ○  3h  @alice
  Refactor auth module (#101)          ✓  ●  4h  @carol
  Add tests (#555)                     ✓  ●  2d  @bob
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
| `Ctrl+M` | Filter: `@marked` |
| `Ctrl+R` | Filter: `@recent` |
| `Ctrl+S` | Filter: `@starred` |
| `Ctrl+E` | Filter: `@me` |
| `Enter` | Open PR (also records to recent) |
| `o` | Open in browser (also records to recent) |

## Filter Tokens

Special filter tokens in the discovery bar:

| Token | Description |
|-------|-------------|
| `@marked` | Show only marked PRs |
| `@recent` | Show only recently opened PRs |
| `@starred` | Show PRs from starred authors |
| `@me` | Show my PRs |

These tokens:
- Can be combined with text search: `@marked fix bug`
- Bypass repo visibility settings (hidden, starredOnly)
- Fetch closed/merged PRs if not in main list

## Command Palette

All actions available via the command palette (`Ctrl+P`):

**Filters:**
- "Show marked PRs" (`Ctrl+M`) - sets `@marked`
- "Show recent PRs" (`Ctrl+R`) - sets `@recent`
- "Show PRs from starred authors" (`Ctrl+S`) - sets `@starred`

**Actions:**
- "Mark/unmark PR" (`m`)
- "Clear from recent" - removes PR from recent history
