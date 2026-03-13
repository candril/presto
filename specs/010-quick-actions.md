# Command Palette

**Status**: In Progress

## Description

A unified command palette (`Ctrl-p`) providing quick access to all filters and actions. Type to fuzzy-search commands, execute actions on the selected PR, or apply filters to the list. Replaces the need to memorize keybindings while also enabling new capabilities like PR state changes.

## Out of Scope

- Nested submenus
- Custom command scripting
- Command history/favorites

## Capabilities

### P1 - Must Have

- **Open palette**: `Ctrl-p` opens command palette overlay
- **Fuzzy search**: Type to filter commands
- **Filter commands**: Apply filters like "Show my PRs", "Show drafts"
- **Action commands**: Execute actions on selected PR
- **Navigation**: `j`/`k` or arrows to navigate, `Enter` to execute
- **Close**: `Escape` to close without action
- **Context-aware**: Only show relevant commands (e.g., "Mark as ready" only on drafts)
- **Dangerous action confirmation**: Inline "Press Enter again to confirm" for merge/close

### P2 - Should Have

- **PR state actions**: Close PR, Merge PR, Mark as ready, Convert to draft
- **Request review**: Action to request review (with author picker)
- **Shortcut hints**: Show existing keybindings next to commands
- **Categories**: Group commands visually (Filters, Actions, State Changes)

### P3 - Nice to Have

- **Recent commands**: Show recently used at top
- **Custom commands**: User-defined commands from config
- **Command chaining**: Execute multiple commands

## Layout

```
┌─ Command Palette ─────────────────────────────────────────┐
│ > merge_                                                  │
├───────────────────────────────────────────────────────────┤
│ STATE CHANGES                                             │
│ > Merge PR                              (on #123)         │
│   Close PR                              (on #123)         │
│                                                           │
│ No other matches                                          │
└───────────────────────────────────────────────────────────┘

┌─ Command Palette ─────────────────────────────────────────┐
│ > _                                                       │
├───────────────────────────────────────────────────────────┤
│ FILTERS                                                   │
│   Show all PRs                                        *   │
│   Show my PRs                                       @me   │
│   Show draft PRs                              state:draft │
│                                                           │
│ ACTIONS (on #123 "Fix auth bug")                          │
│   Open in browser                                     o   │
│   Open in riff                                    Enter   │
│   Copy URL                                            Y   │
│   Copy PR number                                      y   │
│                                                           │
│ STATE CHANGES (on #123)                                   │
│   Mark as ready                                           │
│   Close PR                                                │
│   Merge PR                                                │
└───────────────────────────────────────────────────────────┘

Confirmation state:
┌─ Command Palette ─────────────────────────────────────────┐
│ > Merge PR                                                │
├───────────────────────────────────────────────────────────┤
│ ⚠ Merge #123 "Fix auth bug" into main?                    │
│                                                           │
│ Press Enter to confirm, Escape to cancel                  │
└───────────────────────────────────────────────────────────┘
```

## Command Types

```typescript
type CommandCategory = "filter" | "action" | "state" | "view"

interface Command {
  id: string
  label: string
  category: CommandCategory
  
  // Display
  description?: string
  shortcut?: string        // Existing keybinding to show
  
  // Behavior
  requiresPR?: boolean     // Only show when PR is selected
  dangerous?: boolean      // Requires confirmation
  available?: (ctx: CommandContext) => boolean  // Dynamic visibility
  
  // Execution
  execute: (ctx: CommandContext) => Promise<CommandResult>
}

interface CommandContext {
  selectedPR: PR | null
  dispatch: Dispatch<AppAction>
  config: Config
  history: History
  renderer: Renderer        // For suspend/resume
}

type CommandResult = 
  | { type: "success"; message?: string }
  | { type: "error"; message: string }
  | { type: "refresh" }     // Trigger PR list refresh after state change
```

## Commands

### Filter Commands

| Command | Filter Applied | Shortcut |
|---------|---------------|----------|
| Show all PRs | `*` | - |
| Show my PRs | `@me` | - |
| Show draft PRs | `state:draft` | - |
| Show open PRs | `state:open` | - |
| Show PRs needing review | `state:review` | - |
| Clear filters | (clear) | `Esc` |

### Action Commands

| Command | Action | Shortcut | Requires PR |
|---------|--------|----------|-------------|
| Open in browser | `gh pr view --web` | `o` | Yes |
| Open in riff | Launch riff | `Enter` | Yes |
| Copy URL | Copy to clipboard | `Y` | Yes |
| Copy PR number | Copy #N | `y` | Yes |
| Star author | Toggle star | `s` | Yes |

### State Change Commands (Dangerous)

| Command | Action | Requires PR | Confirmation |
|---------|--------|-------------|--------------|
| Mark as ready | `gh pr ready` | Yes (draft only) | No |
| Convert to draft | `gh pr ready --undo` | Yes (ready only) | No |
| Close PR | `gh pr close` | Yes (open only) | Yes |
| Reopen PR | `gh pr reopen` | Yes (closed only) | No |
| Merge PR | `gh pr merge` | Yes (open, checks pass) | Yes |

## Technical Notes

### Command Definitions

```typescript
// src/commands/definitions.ts
import type { Command, CommandContext } from "./types"

export const commands: Command[] = [
  // === FILTERS ===
  {
    id: "filter.all",
    label: "Show all PRs",
    category: "filter",
    shortcut: "*",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "*" })
      return { type: "success" }
    },
  },
  {
    id: "filter.mine",
    label: "Show my PRs",
    category: "filter",
    shortcut: "@me",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "@me" })
      return { type: "success" }
    },
  },
  {
    id: "filter.drafts",
    label: "Show draft PRs",
    category: "filter",
    shortcut: "state:draft",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "state:draft" })
      return { type: "success" }
    },
  },
  {
    id: "filter.clear",
    label: "Clear filters",
    category: "filter",
    shortcut: "Esc",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "" })
      return { type: "success" }
    },
  },

  // === ACTIONS ===
  {
    id: "action.browser",
    label: "Open in browser",
    category: "action",
    shortcut: "o",
    requiresPR: true,
    execute: async (ctx) => {
      await openInBrowser(ctx.selectedPR!)
      return { type: "success", message: "Opened in browser" }
    },
  },
  {
    id: "action.riff",
    label: "Open in riff",
    category: "action",
    shortcut: "Enter",
    requiresPR: true,
    execute: async (ctx) => {
      ctx.renderer.suspend()
      try {
        await openInRiff(ctx.selectedPR!)
      } finally {
        ctx.renderer.resume()
      }
      return { type: "success" }
    },
  },
  {
    id: "action.copy_url",
    label: "Copy URL",
    category: "action",
    shortcut: "Y",
    requiresPR: true,
    execute: async (ctx) => {
      await copyPRUrl(ctx.selectedPR!)
      return { type: "success", message: `Copied ${ctx.selectedPR!.url}` }
    },
  },
  {
    id: "action.copy_number",
    label: "Copy PR number",
    category: "action",
    shortcut: "y",
    requiresPR: true,
    execute: async (ctx) => {
      await copyPRNumber(ctx.selectedPR!)
      return { type: "success", message: `Copied #${ctx.selectedPR!.number}` }
    },
  },
  {
    id: "action.star",
    label: "Star/unstar author",
    category: "action",
    shortcut: "s",
    requiresPR: true,
    execute: async (ctx) => {
      const author = ctx.selectedPR!.author.login
      const newHistory = toggleStarAuthor(ctx.history, author)
      saveHistory(newHistory)
      const isStarred = newHistory.starredAuthors.includes(author)
      return { 
        type: "success", 
        message: `${isStarred ? "★ Starred" : "☆ Unstarred"} @${author}` 
      }
    },
  },

  // === STATE CHANGES ===
  {
    id: "state.ready",
    label: "Mark as ready",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.isDraft === true,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      await $`gh pr ready ${pr.number} -R ${getRepoName(pr)}`.quiet()
      return { type: "refresh" }
    },
  },
  {
    id: "state.draft",
    label: "Convert to draft",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.isDraft === false && ctx.selectedPR?.state === "OPEN",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      await $`gh pr ready ${pr.number} -R ${getRepoName(pr)} --undo`.quiet()
      return { type: "refresh" }
    },
  },
  {
    id: "state.close",
    label: "Close PR",
    category: "state",
    requiresPR: true,
    dangerous: true,
    available: (ctx) => ctx.selectedPR?.state === "OPEN",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      await $`gh pr close ${pr.number} -R ${getRepoName(pr)}`.quiet()
      return { type: "refresh" }
    },
  },
  {
    id: "state.reopen",
    label: "Reopen PR",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.state === "CLOSED",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      await $`gh pr reopen ${pr.number} -R ${getRepoName(pr)}`.quiet()
      return { type: "refresh" }
    },
  },
  {
    id: "state.merge",
    label: "Merge PR",
    category: "state",
    requiresPR: true,
    dangerous: true,
    available: (ctx) => ctx.selectedPR?.state === "OPEN" && !ctx.selectedPR?.isDraft,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      await $`gh pr merge ${pr.number} -R ${getRepoName(pr)} --merge`.quiet()
      return { type: "refresh" }
    },
  },
]
```

### Command Palette Component

```tsx
// src/components/CommandPalette.tsx
import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import { commands } from "../commands/definitions"
import type { Command, CommandContext } from "../commands/types"

interface CommandPaletteProps {
  visible: boolean
  context: CommandContext
  onClose: () => void
  onExecute: (result: CommandResult) => void
}

export function CommandPalette({ visible, context, onClose, onExecute }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirming, setConfirming] = useState<Command | null>(null)

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setQuery("")
      setSelectedIndex(0)
      setConfirming(null)
    }
  }, [visible])

  // Filter and group commands
  const { filtered, grouped } = useMemo(() => {
    const available = commands.filter(cmd => {
      // Check if command is available in current context
      if (cmd.requiresPR && !context.selectedPR) return false
      if (cmd.available && !cmd.available(context)) return false
      return true
    })

    // Fuzzy filter by query
    const filtered = query
      ? available.filter(cmd => 
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.shortcut?.toLowerCase().includes(query.toLowerCase())
        )
      : available

    // Group by category
    const grouped = groupByCategory(filtered)
    
    return { filtered, grouped }
  }, [query, context])

  const handleExecute = async (cmd: Command) => {
    // If dangerous and not confirming, enter confirmation mode
    if (cmd.dangerous && confirming?.id !== cmd.id) {
      setConfirming(cmd)
      return
    }

    // Execute command
    setConfirming(null)
    onClose()
    
    try {
      const result = await cmd.execute(context)
      onExecute(result)
    } catch (err) {
      onExecute({ type: "error", message: String(err) })
    }
  }

  useKeyboard((key) => {
    if (!visible) return

    // Confirmation mode
    if (confirming) {
      if (key.name === "return") {
        handleExecute(confirming)
      } else if (key.name === "escape") {
        setConfirming(null)
      }
      return
    }

    // Normal mode
    if (key.name === "escape") {
      onClose()
    } else if (key.name === "return") {
      if (filtered[selectedIndex]) {
        handleExecute(filtered[selectedIndex])
      }
    } else if (key.name === "up" || (key.name === "k" && key.ctrl)) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.name === "down" || (key.name === "j" && key.ctrl)) {
      setSelectedIndex(i => Math.min(filtered.length - 1, i + 1))
    } else if (key.name === "backspace") {
      setQuery(q => q.slice(0, -1))
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      setQuery(q => q + key.sequence)
      setSelectedIndex(0)
    }
  })

  if (!visible) return null

  // Confirmation view
  if (confirming) {
    return (
      <box position="absolute" top={2} left="center" width={60} /* ... */>
        <box padding={1}>
          <text fg={theme.warning}>
            ⚠ {confirming.label} #{context.selectedPR?.number}?
          </text>
        </box>
        <box padding={1}>
          <text fg={theme.textDim}>
            Press Enter to confirm, Escape to cancel
          </text>
        </box>
      </box>
    )
  }

  // Normal view
  return (
    <box position="absolute" top={2} left="center" width={60} /* ... */>
      {/* Search input */}
      <box padding={1}>
        <text fg={theme.primary}>&gt; </text>
        <text>{query}<span fg={theme.primary}>_</span></text>
      </box>

      {/* Commands grouped by category */}
      <scrollbox maxHeight={20}>
        {Object.entries(grouped).map(([category, cmds]) => (
          <box key={category} flexDirection="column">
            <text fg={theme.textMuted}>{formatCategory(category)}</text>
            {cmds.map((cmd, idx) => {
              const globalIdx = filtered.indexOf(cmd)
              return (
                <CommandRow
                  key={cmd.id}
                  command={cmd}
                  selected={globalIdx === selectedIndex}
                  context={context}
                />
              )
            })}
          </box>
        ))}
      </scrollbox>
    </box>
  )
}
```

### State Updates

```typescript
// src/state.ts additions
export type AppAction =
  // ... existing
  | { type: "OPEN_COMMAND_PALETTE" }
  | { type: "CLOSE_COMMAND_PALETTE" }

export interface AppState {
  // ... existing
  commandPaletteVisible: boolean
}
```

### Keyboard Integration

```typescript
// In useKeyboardNav.ts
if (key.ctrl && key.name === "p") {
  dispatch({ type: "OPEN_COMMAND_PALETTE" })
  return
}
```

## Relationship to Other Features

- **Discovery bar (`/`)**: Kept as lightweight filter-only interface
- **Direct shortcuts**: Still work (`o`, `y`, `s`, etc.) for power users  
- **Help overlay (`?`)**: Shows keybindings reference, command palette is actionable

## File Structure

```
src/
├── commands/
│   ├── types.ts              # Command types
│   ├── definitions.ts        # All command definitions
│   └── index.ts              # Exports
├── components/
│   └── CommandPalette.tsx    # Palette UI
├── hooks/
│   └── useKeyboardNav.ts     # Add Ctrl-p handler
└── state.ts                  # Add palette state
```
