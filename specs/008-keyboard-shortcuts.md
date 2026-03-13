# Keyboard Shortcuts

**Status**: Draft

## Description

Comprehensive keyboard navigation with a help modal showing all available shortcuts. Support for vim-style navigation, configurable keybindings, and discoverable shortcuts.

## Out of Scope

- Mouse support (keyboard-first app)
- Complex key sequences (keep it simple)
- Recording macros

## Capabilities

### P1 - Must Have

- **Help modal**: `?` to show all keybindings
- **Vim navigation**: `j`/`k` for up/down, `g`/`G` for top/bottom
- **Action keys**: `o` browser, `r` riff, `y` copy, `q` quit
- **View toggle**: `Enter` expand, `Escape` collapse

### P2 - Should Have

- **Arrow keys**: Alternative to j/k
- **Page navigation**: `Ctrl+d`/`Ctrl+u` for half-page scroll
- **Quick filters**: `1`-`3` for filter presets
- **Refresh**: `R` to refresh data
- **Search**: `/` to open search

### P3 - Nice to Have

- **Configurable keys**: Override defaults in config
- **Key hints**: Show available keys in context
- **Chord support**: Simple two-key combos (e.g., `g g` for top)

## Technical Notes

### Default Keybindings

```typescript
// src/keys.ts
export interface KeyBinding {
  key: string
  action: string
  description: string
  context?: "list" | "detail" | "search" | "global"
}

export const defaultKeyBindings: KeyBinding[] = [
  // Navigation
  { key: "j", action: "move_down", description: "Move down", context: "list" },
  { key: "k", action: "move_up", description: "Move up", context: "list" },
  { key: "down", action: "move_down", description: "Move down", context: "list" },
  { key: "up", action: "move_up", description: "Move up", context: "list" },
  { key: "g", action: "go_top", description: "Go to top", context: "list" },
  { key: "G", action: "go_bottom", description: "Go to bottom", context: "list" },
  { key: "ctrl+d", action: "page_down", description: "Page down", context: "list" },
  { key: "ctrl+u", action: "page_up", description: "Page up", context: "list" },
  
  // Views
  { key: "enter", action: "expand", description: "View details", context: "list" },
  { key: "escape", action: "collapse", description: "Back to list", context: "detail" },
  { key: "escape", action: "close_search", description: "Close search", context: "search" },
  
  // Actions
  { key: "o", action: "open_browser", description: "Open in browser", context: "global" },
  { key: "r", action: "open_riff", description: "Open in riff", context: "global" },
  { key: "y", action: "copy_url", description: "Copy URL", context: "global" },
  { key: "a", action: "actions_menu", description: "Actions menu", context: "global" },
  
  // Filters
  { key: "/", action: "search", description: "Search", context: "list" },
  { key: "1", action: "filter_mine", description: "My PRs", context: "list" },
  { key: "2", action: "filter_reviews", description: "Review requests", context: "list" },
  { key: "3", action: "filter_all", description: "All PRs", context: "list" },
  
  // App
  { key: "R", action: "refresh", description: "Refresh", context: "global" },
  { key: "?", action: "help", description: "Help", context: "global" },
  { key: "q", action: "quit", description: "Quit", context: "global" },
]
```

### Key Handler

```typescript
// src/hooks/useKeyHandler.ts
import { useKeyboard } from "@opentui/react"
import type { KeyBinding } from "../keys"
import type { AppState } from "../state"

type KeyAction = (typeof defaultKeyBindings)[number]["action"]

export function useKeyHandler(
  state: AppState,
  bindings: KeyBinding[],
  onAction: (action: KeyAction) => void
) {
  useKeyboard((key) => {
    // Determine current context
    const context = state.searchActive 
      ? "search" 
      : state.viewMode === "detail" 
        ? "detail" 
        : "list"
    
    // Build key string
    const keyStr = buildKeyString(key)
    
    // Find matching binding
    const binding = bindings.find(b => 
      b.key === keyStr && 
      (b.context === context || b.context === "global")
    )
    
    if (binding) {
      onAction(binding.action as KeyAction)
    }
  })
}

function buildKeyString(key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): string {
  const parts: string[] = []
  if (key.ctrl) parts.push("ctrl")
  if (key.meta) parts.push("meta")
  if (key.shift && key.name && key.name.length === 1) {
    // For letters, shift makes it uppercase
    return key.name.toUpperCase()
  }
  if (key.name) parts.push(key.name)
  return parts.join("+")
}
```

### Help Modal Component

```tsx
// src/components/HelpModal.tsx
import { theme } from "../theme"
import { defaultKeyBindings, type KeyBinding } from "../keys"

interface HelpModalProps {
  visible: boolean
  onClose: () => void
}

export function HelpModal({ visible, onClose }: HelpModalProps) {
  if (!visible) return null
  
  // Group by context
  const groups = groupByContext(defaultKeyBindings)
  
  return (
    <box
      position="absolute"
      top={2}
      left={4}
      right={4}
      bottom={2}
      backgroundColor={theme.bg}
      border={{ type: "rounded", fg: theme.primary }}
      padding={1}
      flexDirection="column"
    >
      <box height={1} marginBottom={1}>
        <text>
          <span fg={theme.primary}>Keyboard Shortcuts</span>
          <span fg={theme.textDim}> (press any key to close)</span>
        </text>
      </box>
      
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {Object.entries(groups).map(([context, bindings]) => (
            <box key={context} flexDirection="column" marginBottom={1}>
              <text fg={theme.warning}>{formatContext(context)}</text>
              {bindings.map(binding => (
                <box key={binding.key} height={1} paddingLeft={2}>
                  <text>
                    <span fg={theme.primary}>{formatKey(binding.key).padEnd(12)}</span>
                    <span fg={theme.text}>{binding.description}</span>
                  </text>
                </box>
              ))}
            </box>
          ))}
        </box>
      </scrollbox>
    </box>
  )
}

function groupByContext(bindings: KeyBinding[]): Record<string, KeyBinding[]> {
  const groups: Record<string, KeyBinding[]> = {}
  for (const binding of bindings) {
    const ctx = binding.context || "global"
    if (!groups[ctx]) groups[ctx] = []
    groups[ctx].push(binding)
  }
  return groups
}

function formatContext(context: string): string {
  const names: Record<string, string> = {
    global: "Global",
    list: "PR List",
    detail: "PR Detail",
    search: "Search",
  }
  return names[context] || context
}

function formatKey(key: string): string {
  return key
    .replace("ctrl+", "Ctrl-")
    .replace("meta+", "Cmd-")
    .replace("enter", "Enter")
    .replace("escape", "Esc")
    .replace("up", "Up")
    .replace("down", "Down")
}
```

### Config Integration

```typescript
// Merge user keybindings with defaults
function getKeyBindings(config: Config): KeyBinding[] {
  const bindings = [...defaultKeyBindings]
  
  // Override with user config
  for (const [action, key] of Object.entries(config.keys)) {
    const binding = bindings.find(b => b.action === action)
    if (binding) {
      binding.key = key
    }
  }
  
  return bindings
}
```

### State for Help Modal

```typescript
// src/state.ts
export interface AppState {
  // ... existing
  helpVisible: boolean
}

export type AppAction =
  // ... existing
  | { type: "TOGGLE_HELP" }
```

## File Structure

```
src/
├── keys.ts                    # Keybinding definitions
├── hooks/
│   └── useKeyHandler.ts       # Key handling hook
├── components/
│   └── HelpModal.tsx          # Help overlay
└── state.ts                   # Add helpVisible state
```
