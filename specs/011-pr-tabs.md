# PR Categories & Tabs

**Status**: Draft

## Description

Organize pull requests into logical categories with a tabbed interface. Quick switching between "My PRs", "Review Requests", "Team PRs", and custom categories.

## Out of Scope

- Saved custom filters (use config)
- Drag-and-drop tab reordering
- Tab close/hide functionality

## Capabilities

### P1 - Must Have

- **Tab bar**: Display tabs at top below header
- **Default tabs**: My PRs, Reviews, All
- **Tab switching**: Number keys (1-3) or Tab to cycle
- **Active indicator**: Highlight current tab
- **PR counts**: Show count in each tab

### P2 - Should Have

- **Tab: Draft PRs**: My draft PRs
- **Tab: Team**: PRs from configured team members
- **Lazy loading**: Only fetch data for active tab
- **Tab persistence**: Remember last active tab

### P3 - Nice to Have

- **Custom tabs**: Define tabs in config
- **Tab badges**: Unread/new indicators
- **Keyboard hints**: Show number keys on tabs

## Technical Notes

### Tab Definitions

```typescript
// src/tabs/definitions.ts
import type { PR } from "../types"

export interface Tab {
  id: string
  label: string
  shortcut: string
  query: TabQuery
  count?: number
}

export interface TabQuery {
  type: "search" | "author" | "review" | "all" | "custom"
  value?: string
  filter?: (pr: PR, currentUser: string) => boolean
}

export const defaultTabs: Tab[] = [
  {
    id: "mine",
    label: "My PRs",
    shortcut: "1",
    query: {
      type: "author",
      value: "@me",
      filter: (pr, user) => pr.author.login === user,
    },
  },
  {
    id: "reviews",
    label: "Reviews",
    shortcut: "2",
    query: {
      type: "review",
      value: "@me",
      filter: (pr, user) => 
        pr.reviewRequests?.some(r => r.login === user) ?? false,
    },
  },
  {
    id: "all",
    label: "All PRs",
    shortcut: "3",
    query: {
      type: "all",
    },
  },
]

// P2 tabs
export const extendedTabs: Tab[] = [
  ...defaultTabs,
  {
    id: "drafts",
    label: "Drafts",
    shortcut: "4",
    query: {
      type: "custom",
      filter: (pr, user) => pr.isDraft && pr.author.login === user,
    },
  },
  {
    id: "team",
    label: "Team",
    shortcut: "5",
    query: {
      type: "custom",
      // Configured via config.team array
    },
  },
]
```

### Tab Bar Component

```tsx
// src/components/TabBar.tsx
import { theme } from "../theme"
import type { Tab } from "../tabs/definitions"

interface TabBarProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <box 
      height={1} 
      width="100%" 
      backgroundColor={theme.headerBg}
      flexDirection="row"
      paddingLeft={1}
      gap={2}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeTab}
          onClick={() => onTabChange(tab.id)}
        />
      ))}
    </box>
  )
}

function TabItem({ 
  tab, 
  active, 
  onClick 
}: { 
  tab: Tab
  active: boolean
  onClick: () => void 
}) {
  const countStr = tab.count !== undefined ? ` (${tab.count})` : ""
  
  return (
    <text 
      fg={active ? theme.primary : theme.textDim}
      onClick={onClick}
    >
      <span fg={theme.textMuted}>{tab.shortcut}:</span>
      {tab.label}
      {countStr}
      {active && <span fg={theme.primary}> ●</span>}
    </text>
  )
}
```

### Tab State Management

```typescript
// src/state.ts
export interface AppState {
  // ... existing
  activeTab: string
  tabData: Map<string, {
    prs: PR[]
    loading: boolean
    error: string | null
    lastFetch: Date | null
  }>
}

export type AppAction =
  // ... existing
  | { type: "SET_ACTIVE_TAB"; tabId: string }
  | { type: "SET_TAB_DATA"; tabId: string; prs: PR[] }
  | { type: "SET_TAB_LOADING"; tabId: string; loading: boolean }
  | { type: "SET_TAB_ERROR"; tabId: string; error: string | null }
```

### Fetching by Tab

```typescript
// src/hooks/useTabData.ts
import { useCallback, useEffect } from "react"
import { listMyPRs, listReviewRequests, listPRsFromRepos } from "../providers/github"
import type { Tab, TabQuery } from "../tabs/definitions"
import type { Config } from "../config/schema"

export function useTabData(
  tab: Tab,
  config: Config,
  dispatch: React.Dispatch<AppAction>
) {
  const fetchTab = useCallback(async () => {
    dispatch({ type: "SET_TAB_LOADING", tabId: tab.id, loading: true })
    
    try {
      let prs: PR[]
      
      switch (tab.query.type) {
        case "author":
          prs = await listMyPRs()
          break
        case "review":
          prs = await listReviewRequests()
          break
        case "all":
          prs = await listPRsFromRepos(config.repositories)
          break
        case "custom":
          // Fetch all and filter
          const allPRs = await listPRsFromRepos(config.repositories)
          const user = await getCurrentUser()
          prs = allPRs.filter(pr => tab.query.filter?.(pr, user) ?? true)
          break
        default:
          prs = []
      }
      
      dispatch({ type: "SET_TAB_DATA", tabId: tab.id, prs })
    } catch (err) {
      dispatch({ 
        type: "SET_TAB_ERROR", 
        tabId: tab.id, 
        error: err instanceof Error ? err.message : "Fetch failed" 
      })
    }
  }, [tab, config, dispatch])
  
  return fetchTab
}

// Cache current user
let cachedUser: string | null = null
async function getCurrentUser(): Promise<string> {
  if (!cachedUser) {
    cachedUser = (await $`gh api user -q .login`.text()).trim()
  }
  return cachedUser
}
```

### Tab Keyboard Handling

```tsx
// In App.tsx
useKeyboard((key) => {
  // Tab switching with number keys
  const tab = tabs.find(t => t.shortcut === key.name)
  if (tab) {
    dispatch({ type: "SET_ACTIVE_TAB", tabId: tab.id })
    return
  }
  
  // Tab key to cycle
  if (key.name === "tab") {
    const currentIdx = tabs.findIndex(t => t.id === state.activeTab)
    const nextIdx = (currentIdx + 1) % tabs.length
    dispatch({ type: "SET_ACTIVE_TAB", tabId: tabs[nextIdx].id })
    return
  }
  
  // Shift+Tab to cycle backwards
  if (key.name === "tab" && key.shift) {
    const currentIdx = tabs.findIndex(t => t.id === state.activeTab)
    const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length
    dispatch({ type: "SET_ACTIVE_TAB", tabId: tabs[prevIdx].id })
    return
  }
})
```

### Config for Custom Tabs

```toml
# In config.toml

# Team members for Team tab
[team]
members = ["alice", "bob", "charlie"]

# Custom tabs (P3)
[[tabs]]
id = "urgent"
label = "Urgent"
shortcut = "6"
search = "label:urgent"

[[tabs]]
id = "backend"
label = "Backend"
shortcut = "7"
repos = ["company/api", "company/services"]
```

### Tab Config Schema

```typescript
// src/config/schema.ts
export interface Config {
  // ... existing
  team: {
    members: string[]
  }
  tabs: {
    id: string
    label: string
    shortcut: string
    search?: string      // GitHub search query
    repos?: string[]     // Filter to specific repos
    authors?: string[]   // Filter to specific authors
  }[]
}
```

### Layout Integration

```tsx
// In App.tsx
function App({ config }: { config: Config }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  
  const tabs = useMemo(() => {
    const allTabs = [...defaultTabs]
    // Add team tab if configured
    if (config.team.members.length > 0) {
      allTabs.push({
        id: "team",
        label: "Team",
        shortcut: "4",
        query: {
          type: "custom",
          filter: (pr) => config.team.members.includes(pr.author.login),
        },
      })
    }
    // Add custom tabs
    for (const customTab of config.tabs) {
      allTabs.push({
        id: customTab.id,
        label: customTab.label,
        shortcut: customTab.shortcut,
        query: { type: "search", value: customTab.search },
      })
    }
    return allTabs
  }, [config])
  
  // Get current tab's PRs
  const currentTabData = state.tabData.get(state.activeTab)
  const prs = currentTabData?.prs ?? []
  
  return (
    <Shell>
      <Header title="presto" />
      <TabBar
        tabs={tabs.map(t => ({
          ...t,
          count: state.tabData.get(t.id)?.prs.length,
        }))}
        activeTab={state.activeTab}
        onTabChange={(id) => dispatch({ type: "SET_ACTIVE_TAB", tabId: id })}
      />
      <PRList
        prs={prs}
        selectedIndex={state.selectedIndex}
        loading={currentTabData?.loading ?? true}
      />
      <StatusBar hints={buildHints(state)} />
    </Shell>
  )
}
```

## File Structure

```
src/
├── tabs/
│   └── definitions.ts         # Tab types and defaults
├── components/
│   └── TabBar.tsx             # Tab bar component
├── hooks/
│   └── useTabData.ts          # Tab data fetching
├── config/
│   └── schema.ts              # Add tab config
└── state.ts                   # Add tab state
```
