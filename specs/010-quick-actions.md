# Quick Actions Menu

**Status**: Draft

## Description

A popup menu showing all available actions for the currently selected pull request. Provides discoverability for actions and serves as an alternative to memorizing keybindings.

## Out of Scope

- Context menus (right-click)
- Nested submenus
- Custom actions per PR (actions are global)

## Capabilities

### P1 - Must Have

- **Action menu**: `a` or `Enter` on detail to open menu
- **Action list**: Show all available actions with keybindings
- **Execute action**: Select and run action
- **Close menu**: `Escape` to close without action

### P2 - Should Have

- **Grouped actions**: Group by category (Open, Copy, etc.)
- **Recent actions**: Show recently used at top
- **Keyboard shortcuts**: Number keys for quick selection
- **Action preview**: Brief description of each action

### P3 - Nice to Have

- **Custom actions**: User-defined tools appear in menu
- **Conditional actions**: Hide unavailable actions
- **Action search**: Type to filter actions

## Technical Notes

### Action Definitions

```typescript
// src/actions/definitions.ts
import type { PR } from "../types"

export interface Action {
  id: string
  label: string
  description: string
  icon?: string
  key?: string
  category: "open" | "copy" | "view" | "other"
  enabled?: (pr: PR) => boolean
  execute: (pr: PR) => Promise<void>
}

export const defaultActions: Action[] = [
  {
    id: "open_browser",
    label: "Open in Browser",
    description: "View PR on GitHub",
    icon: "🌐",
    key: "o",
    category: "open",
    execute: async (pr) => {
      await $`gh pr view ${pr.number} -R ${pr.repository.nameWithOwner} --web`
    },
  },
  {
    id: "open_riff",
    label: "Open in Riff",
    description: "Review code in riff",
    icon: "📝",
    key: "r",
    category: "open",
    execute: async (pr) => {
      await $`riff gh:${pr.repository.nameWithOwner}#${pr.number}`
    },
  },
  {
    id: "copy_url",
    label: "Copy URL",
    description: "Copy PR URL to clipboard",
    icon: "📋",
    key: "y",
    category: "copy",
    execute: async (pr) => {
      const url = `https://github.com/${pr.repository.nameWithOwner}/pull/${pr.number}`
      await $`echo ${url} | pbcopy`
    },
  },
  {
    id: "copy_branch",
    label: "Copy Branch Name",
    description: "Copy source branch name",
    icon: "🌿",
    key: "b",
    category: "copy",
    execute: async (pr) => {
      await $`echo ${pr.headRefName} | pbcopy`
    },
  },
  {
    id: "checkout",
    label: "Checkout Branch",
    description: "Switch to PR branch locally",
    icon: "⬇️",
    key: "c",
    category: "other",
    execute: async (pr) => {
      await $`gh pr checkout ${pr.number} -R ${pr.repository.nameWithOwner}`
    },
  },
  {
    id: "view_diff",
    label: "View Diff",
    description: "Show PR diff in terminal",
    icon: "📊",
    key: "d",
    category: "view",
    execute: async (pr) => {
      await $`gh pr diff ${pr.number} -R ${pr.repository.nameWithOwner} | less`
    },
  },
]
```

### Quick Actions Menu Component

```tsx
// src/components/QuickActionsMenu.tsx
import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import type { Action } from "../actions/definitions"
import type { PR } from "../types"

interface QuickActionsMenuProps {
  visible: boolean
  pr: PR
  actions: Action[]
  onSelect: (action: Action) => void
  onClose: () => void
}

export function QuickActionsMenu({ 
  visible, 
  pr, 
  actions, 
  onSelect, 
  onClose 
}: QuickActionsMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  // Filter to enabled actions
  const availableActions = actions.filter(
    a => !a.enabled || a.enabled(pr)
  )
  
  // Group by category
  const grouped = groupByCategory(availableActions)
  const flatList = Object.values(grouped).flat()
  
  useKeyboard((key) => {
    if (!visible) return
    
    switch (key.name) {
      case "escape":
        onClose()
        break
      case "enter":
        onSelect(flatList[selectedIndex])
        break
      case "j":
      case "down":
        setSelectedIndex(i => Math.min(i + 1, flatList.length - 1))
        break
      case "k":
      case "up":
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      default:
        // Number keys for quick select
        const num = parseInt(key.name || "")
        if (num >= 1 && num <= flatList.length) {
          onSelect(flatList[num - 1])
        }
        // Direct key shortcut
        const action = flatList.find(a => a.key === key.name)
        if (action) {
          onSelect(action)
        }
    }
  })
  
  if (!visible) return null
  
  return (
    <box
      position="absolute"
      top="center"
      left="center"
      width={50}
      backgroundColor={theme.bg}
      border={{ type: "rounded", fg: theme.primary }}
      padding={1}
      flexDirection="column"
    >
      {/* Header */}
      <box height={1} marginBottom={1}>
        <text fg={theme.primary}>Actions for #{pr.number}</text>
      </box>
      
      {/* Actions by category */}
      {Object.entries(grouped).map(([category, categoryActions]) => (
        <box key={category} flexDirection="column" marginBottom={1}>
          <text fg={theme.textMuted}>{formatCategory(category)}</text>
          {categoryActions.map((action, idx) => {
            const globalIdx = flatList.indexOf(action)
            const selected = globalIdx === selectedIndex
            return (
              <ActionRow
                key={action.id}
                action={action}
                index={globalIdx + 1}
                selected={selected}
              />
            )
          })}
        </box>
      ))}
      
      {/* Footer */}
      <box height={1} marginTop={1}>
        <text fg={theme.textDim}>
          Enter to select, Esc to cancel
        </text>
      </box>
    </box>
  )
}

function ActionRow({ 
  action, 
  index, 
  selected 
}: { 
  action: Action
  index: number
  selected: boolean 
}) {
  return (
    <box
      height={1}
      paddingLeft={2}
      backgroundColor={selected ? theme.headerBg : undefined}
    >
      <text>
        <span fg={theme.textDim}>{index}.</span>
        {" "}
        {action.icon && <span>{action.icon} </span>}
        <span fg={selected ? theme.primary : theme.text}>
          {action.label}
        </span>
        {action.key && (
          <span fg={theme.textMuted}> [{action.key}]</span>
        )}
      </text>
    </box>
  )
}

function groupByCategory(actions: Action[]): Record<string, Action[]> {
  const groups: Record<string, Action[]> = {}
  for (const action of actions) {
    if (!groups[action.category]) {
      groups[action.category] = []
    }
    groups[action.category].push(action)
  }
  return groups
}

function formatCategory(category: string): string {
  const names: Record<string, string> = {
    open: "Open",
    copy: "Copy",
    view: "View",
    other: "Other",
  }
  return names[category] || category
}
```

### Integration with App

```tsx
// In App.tsx
function App({ config }: { config: Config }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const renderer = useRenderer()
  
  const handleAction = useCallback(async (action: Action) => {
    const pr = state.prs[state.selectedIndex]
    if (!pr) return
    
    dispatch({ type: "CLOSE_ACTIONS_MENU" })
    
    // For TUI tools, suspend renderer
    if (action.id === "open_riff" || action.id === "view_diff") {
      renderer.suspend()
      try {
        await action.execute(pr)
      } finally {
        renderer.resume()
      }
    } else {
      await action.execute(pr)
      dispatch({ type: "SHOW_MESSAGE", message: `${action.label} completed` })
    }
  }, [state.prs, state.selectedIndex, renderer])
  
  return (
    <Shell>
      {/* ... main content ... */}
      
      <QuickActionsMenu
        visible={state.actionsMenuVisible}
        pr={state.prs[state.selectedIndex]}
        actions={getAllActions(config)}
        onSelect={handleAction}
        onClose={() => dispatch({ type: "CLOSE_ACTIONS_MENU" })}
      />
    </Shell>
  )
}
```

### Custom Actions from Config

```typescript
// src/actions/loader.ts
import { defaultActions, type Action } from "./definitions"
import type { Config } from "../config/schema"

export function getAllActions(config: Config): Action[] {
  const actions = [...defaultActions]
  
  // Add custom tools from config
  for (const [name, tool] of Object.entries(config.tools.custom)) {
    actions.push({
      id: `custom_${name}`,
      label: name,
      description: tool.command,
      key: tool.key,
      category: "other",
      execute: async (pr) => {
        const cmd = tool.command
          .replace("{repo}", pr.repository.nameWithOwner)
          .replace("{number}", String(pr.number))
          .replace("{url}", `https://github.com/${pr.repository.nameWithOwner}/pull/${pr.number}`)
          .replace("{branch}", pr.headRefName)
        await $`sh -c ${cmd}`
      },
    })
  }
  
  return actions
}
```

### State Updates

```typescript
// src/state.ts
export interface AppState {
  // ... existing
  actionsMenuVisible: boolean
  lastAction: string | null
  statusMessage: string | null
}

export type AppAction =
  // ... existing
  | { type: "OPEN_ACTIONS_MENU" }
  | { type: "CLOSE_ACTIONS_MENU" }
  | { type: "SHOW_MESSAGE"; message: string }
  | { type: "CLEAR_MESSAGE" }
```

## File Structure

```
src/
├── actions/
│   ├── definitions.ts         # Action types and defaults
│   └── loader.ts              # Load custom actions
├── components/
│   └── QuickActionsMenu.tsx   # Actions popup
└── state.ts                   # Add menu state
```
