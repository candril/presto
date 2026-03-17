# Dynamic PR Tabs

**Status**: In Progress (P1 Complete)

## Description

Tabs are saved views created on-the-fly. Press `t` to open a new tab with default filter. Each tab maintains its own filter, and the tab title is auto-generated from the filter in human-readable format. Smart background refresh fetches data once and distributes to all tabs. Tabs persist across sessions.

## Out of Scope

- Predefined/hardcoded tab categories
- Tab reordering

## Capabilities

### P1 - Must Have

- **Tab creation**: `t` duplicates current tab (copies filter state)
- **Tab bar visibility**: Only shown when >1 tab exists
- **Tab switching**: Number keys `1-9` switch to tab N, `[`/`]` for prev/next
- **Independent filters**: Each tab has its own filter/search state
- **Smart titles**: Tab title derived from filter (e.g., "author:alice draft:true" → "Alice's Drafts")
- **Tab closing**: `d` closes current tab (can't close last tab)
- **Tab undo**: `u` restores last closed tab
- **Selection per tab**: Each tab remembers its selected PR index
- **Notification dot**: Show `*` on tab if any PR in that tab's list has unread activity
- **Tab persistence**: Tabs saved to disk, restored on app launch

### P2 - Should Have

- **Smart refresh**: Single background fetch, results distributed to all tabs
- **Tab rename**: Override auto-generated title (Ctrl-p action)
- **Visual indicator**: Different styling for active vs inactive tabs
- **Close other tabs**: Ctrl-p action to close all tabs except current

### P3 - Nice to Have

- **Tab limit**: Max 9 tabs (matches keyboard shortcuts)
- **Tab overflow**: Handle many tabs gracefully
- **Quick tab actions**: Popup menu for tab actions

## Technical Notes

### Tab Data Structure

```typescript
// src/tabs/types.ts
export interface Tab {
  id: string
  title: string           // Auto-generated or custom
  titleOverride?: string  // User override
  filter: FilterState     // Each tab's filter state
  hasNotification: boolean // Any PR has unread activity
}

export interface FilterState {
  search: string
  author: string | null
  isDraft: boolean | null
  repo: string | null
  label: string | null
  // ... other filter fields
}

export interface TabsState {
  tabs: Tab[]
  activeTabId: string
}
```

### Human-Readable Title Generation

```typescript
// src/tabs/title.ts
export function generateTabTitle(filter: FilterState): string {
  const parts: string[] = []
  
  if (filter.author) {
    parts.push(`${formatUsername(filter.author)}'s`)
  }
  
  if (filter.isDraft === true) {
    parts.push("Drafts")
  } else if (filter.isDraft === false) {
    parts.push("Ready")
  }
  
  if (filter.repo) {
    parts.push(`in ${shortRepoName(filter.repo)}`)
  }
  
  if (filter.label) {
    parts.push(`[${filter.label}]`)
  }
  
  if (filter.search) {
    parts.push(`"${truncate(filter.search, 20)}"`)
  }
  
  // Default if no filters
  if (parts.length === 0) {
    return "All PRs"
  }
  
  // Smart joining: "Alice's Drafts in api"
  return parts.join(" ")
}

function formatUsername(username: string): string {
  // @me → "My", alice → "Alice"
  if (username === "@me") return "My"
  return username.charAt(0).toUpperCase() + username.slice(1)
}

function shortRepoName(repo: string): string {
  // owner/repo → repo
  return repo.split("/").pop() ?? repo
}
```

### Tab Bar Component

```tsx
// src/components/TabBar.tsx
import { theme } from "../theme"
import type { Tab } from "../tabs/types"

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
}

export function TabBar({ tabs, activeTabId, onTabChange }: TabBarProps) {
  // Don't render if only one tab
  if (tabs.length <= 1) return null
  
  return (
    <box 
      height={1} 
      width="100%" 
      backgroundColor={theme.headerBg}
      flexDirection="row"
      paddingLeft={1}
      gap={2}
    >
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.id}
          tab={tab}
          index={index + 1}
          active={tab.id === activeTabId}
          onSelect={() => onTabChange(tab.id)}
        />
      ))}
    </box>
  )
}

function TabItem({ 
  tab, 
  index,
  active, 
  onSelect,
}: { 
  tab: Tab
  index: number
  active: boolean
  onSelect: () => void 
}) {
  const title = tab.titleOverride ?? tab.title
  
  return (
    <text fg={active ? theme.primary : theme.textDim}>
      <span fg={theme.textMuted}>{index}:</span>
      {title}
      {tab.hasNotification && <span fg={theme.notification}> ●</span>}
      {active && <span fg={theme.primary}> ▸</span>}
    </text>
  )
}
```

### Tab State Management

```typescript
// src/state.ts
export interface AppState {
  // ... existing
  tabs: Tab[]
  activeTabId: string
}

export type AppAction =
  // ... existing
  | { type: "DUPLICATE_TAB" }  // Duplicates current tab with its filter
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "CLOSE_OTHER_TABS" }  // Close all except active (P2)
  | { type: "SWITCH_TAB"; tabId: string }
  | { type: "UPDATE_TAB_FILTER"; tabId: string; filter: Partial<FilterState> }
  | { type: "RENAME_TAB"; tabId: string; title: string }
  | { type: "UPDATE_TAB_NOTIFICATIONS"; tabId: string; hasNotification: boolean }
  | { type: "LOAD_TABS"; tabs: Tab[]; activeTabId: string }

function tabsReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "DUPLICATE_TAB": {
      const currentTab = state.tabs.find(t => t.id === state.activeTabId)
      if (!currentTab) return state
      
      const newTab: Tab = {
        id: crypto.randomUUID(),
        title: currentTab.title,
        filter: { ...currentTab.filter },
        hasNotification: currentTab.hasNotification,
      }
      
      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      }
    }
    
    case "CLOSE_TAB": {
      // Can't close last tab
      if (state.tabs.length <= 1) return state
      
      const closingIndex = state.tabs.findIndex(t => t.id === action.tabId)
      const newTabs = state.tabs.filter(t => t.id !== action.tabId)
      const needNewActive = state.activeTabId === action.tabId
      
      // Switch to adjacent tab (prefer left, then right)
      let newActiveId = state.activeTabId
      if (needNewActive) {
        const newIndex = Math.min(closingIndex, newTabs.length - 1)
        newActiveId = newTabs[newIndex].id
      }
      
      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveId,
      }
    }
    
    case "CLOSE_OTHER_TABS": {
      const currentTab = state.tabs.find(t => t.id === state.activeTabId)
      if (!currentTab) return state
      
      return {
        ...state,
        tabs: [currentTab],
      }
    }
    
    case "SWITCH_TAB": {
      return { ...state, activeTabId: action.tabId }
    }
    
    case "LOAD_TABS": {
      return { 
        ...state, 
        tabs: action.tabs, 
        activeTabId: action.activeTabId 
      }
    }
    
    // ... other cases
  }
}
```

### Smart Background Refresh

```typescript
// src/hooks/useSmartRefresh.ts
import { useCallback, useEffect, useRef } from "react"
import type { PR } from "../types"
import type { Tab, FilterState } from "../tabs/types"

export function useSmartRefresh(
  tabs: Tab[],
  dispatch: React.Dispatch<AppAction>,
  refreshInterval: number
) {
  const lastFetch = useRef<Date | null>(null)
  const allPRs = useRef<PR[]>([])
  
  // Single fetch, distribute to all tabs
  const refresh = useCallback(async () => {
    // Fetch all PRs once
    const prs = await fetchAllPRs()
    allPRs.current = prs
    lastFetch.current = new Date()
    
    // Distribute to each tab based on its filter
    for (const tab of tabs) {
      const filteredPRs = applyFilter(prs, tab.filter)
      const hasNotification = filteredPRs.some(pr => pr.hasUnreadActivity)
      
      dispatch({ 
        type: "SET_TAB_PRS", 
        tabId: tab.id, 
        prs: filteredPRs 
      })
      dispatch({ 
        type: "UPDATE_TAB_NOTIFICATIONS", 
        tabId: tab.id, 
        hasNotification 
      })
    }
  }, [tabs, dispatch])
  
  // On filter change, recompute from cached data (no fetch)
  const recomputeTab = useCallback((tabId: string, filter: FilterState) => {
    const filteredPRs = applyFilter(allPRs.current, filter)
    const hasNotification = filteredPRs.some(pr => pr.hasUnreadActivity)
    
    dispatch({ type: "SET_TAB_PRS", tabId, prs: filteredPRs })
    dispatch({ type: "UPDATE_TAB_NOTIFICATIONS", tabId, hasNotification })
  }, [dispatch])
  
  // Background refresh interval
  useEffect(() => {
    const interval = setInterval(refresh, refreshInterval)
    return () => clearInterval(interval)
  }, [refresh, refreshInterval])
  
  return { refresh, recomputeTab }
}

function applyFilter(prs: PR[], filter: FilterState): PR[] {
  return prs.filter(pr => {
    if (filter.author && pr.author.login !== filter.author) return false
    if (filter.isDraft !== null && pr.isDraft !== filter.isDraft) return false
    if (filter.repo && pr.repository !== filter.repo) return false
    if (filter.label && !pr.labels.includes(filter.label)) return false
    if (filter.search && !matchesSearch(pr, filter.search)) return false
    return true
  })
}
```

### Keyboard Handling

```tsx
// In App.tsx or useTabKeyboard.ts
useKeyboard((key) => {
  // 't' to duplicate current tab
  if (key.name === "t" && !state.inputFocused) {
    dispatch({ type: "DUPLICATE_TAB" })
    return
  }
  
  // Number keys 1-9 to switch tabs
  const tabIndex = parseInt(key.name, 10)
  if (tabIndex >= 1 && tabIndex <= 9 && tabIndex <= state.tabs.length) {
    const tab = state.tabs[tabIndex - 1]
    dispatch({ type: "SWITCH_TAB", tabId: tab.id })
    return
  }
})

// Ctrl-p actions for tab management
const tabActions: CommandPaletteAction[] = [
  {
    id: "close-tab",
    label: "Close Tab",
    enabled: state.tabs.length > 1,
    action: () => dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId }),
  },
  // P2
  {
    id: "close-other-tabs",
    label: "Close Other Tabs",
    enabled: state.tabs.length > 1,
    action: () => dispatch({ type: "CLOSE_OTHER_TABS" }),
  },
  // P2
  {
    id: "rename-tab",
    label: "Rename Tab",
    action: () => dispatch({ type: "START_TAB_RENAME" }),
  },
]
```

### Tab Persistence

```typescript
// src/tabs/persistence.ts
import { homedir } from "os"
import { join } from "path"
import type { Tab } from "./types"

const TABS_FILE = join(homedir(), ".config", "presto", "tabs.json")

interface PersistedTabs {
  tabs: Tab[]
  activeTabId: string
}

export async function loadTabs(): Promise<PersistedTabs | null> {
  try {
    const file = Bun.file(TABS_FILE)
    if (await file.exists()) {
      return await file.json()
    }
  } catch {
    // File doesn't exist or invalid JSON
  }
  return null
}

export async function saveTabs(tabs: Tab[], activeTabId: string): Promise<void> {
  const data: PersistedTabs = { tabs, activeTabId }
  await Bun.write(TABS_FILE, JSON.stringify(data, null, 2))
}

// Debounced save to avoid excessive writes
let saveTimeout: Timer | null = null
export function debouncedSaveTabs(tabs: Tab[], activeTabId: string): void {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => saveTabs(tabs, activeTabId), 500)
}
```

### Hook for Persistence

```typescript
// src/hooks/useTabPersistence.ts
import { useEffect } from "react"
import { loadTabs, debouncedSaveTabs } from "../tabs/persistence"
import type { Tab } from "../tabs/types"

export function useTabPersistence(
  tabs: Tab[],
  activeTabId: string,
  dispatch: React.Dispatch<AppAction>
) {
  // Load tabs on mount
  useEffect(() => {
    loadTabs().then((persisted) => {
      if (persisted && persisted.tabs.length > 0) {
        dispatch({ 
          type: "LOAD_TABS", 
          tabs: persisted.tabs, 
          activeTabId: persisted.activeTabId 
        })
      }
    })
  }, [dispatch])
  
  // Save tabs on change
  useEffect(() => {
    debouncedSaveTabs(tabs, activeTabId)
  }, [tabs, activeTabId])
}
```

### Initial State

```typescript
// src/state.ts
function defaultFilter(): FilterState {
  return {
    search: "",
    author: null,
    isDraft: null,
    repo: null,
    label: null,
  }
}

export const initialState: AppState = {
  // ... existing
  tabs: [
    {
      id: "default",
      title: "All PRs",
      filter: defaultFilter(),
      hasNotification: false,
    }
  ],
  activeTabId: "default",
}
```

## UX Flow

1. **Start**: Load persisted tabs (or single default "All PRs" tab), tab bar hidden if only one
2. **Filter**: User applies filter (author:alice), title updates to "Alice's PRs"
3. **Duplicate**: User presses `t`, tab duplicated with same filter, tab bar appears
4. **Modify**: User changes filter on new tab, title updates independently
5. **Switch**: User presses `1` to go back to first tab, `2` for second, or `[`/`]` to cycle
6. **Close**: User presses `d` to close tab, switches to adjacent tab
7. **Undo**: User presses `u` to restore the closed tab
8. **Notification**: Background refresh marks tabs with unread activity `*`
9. **Quit**: Tabs automatically saved (including selection per tab), restored on next launch

## File Structure

```
src/
├── tabs/
│   ├── types.ts              # Tab and filter types
│   ├── title.ts              # Human-readable title generation
│   └── persistence.ts        # Save/load tabs to disk
├── components/
│   └── TabBar.tsx            # Tab bar component
├── hooks/
│   ├── useSmartRefresh.ts    # Single-fetch background refresh
│   ├── useTabKeyboard.ts     # Tab keyboard shortcuts
│   └── useTabPersistence.ts  # Load/save tabs on mount/change
└── state.ts                  # Tab state management
```
