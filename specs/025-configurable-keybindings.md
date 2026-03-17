# Configurable Keybindings

**Status**: Done

## Description

Allow users to customize keyboard shortcuts via `~/.config/presto/config.toml`. All keybindings should be configurable with sensible defaults matching current hardcoded values. The system should support single keys, modifier combinations (Ctrl, Shift), and validate for conflicts.

## Out of Scope

- Vim-style multi-key sequences (e.g., `gg`, `dd`)
- Recording/playback macros
- Per-context keybinding overrides (same key does different things in different modes)

## Capabilities

### P1 - Must Have

- **Centralized keybinding definitions**: All keys defined in one place with defaults
- **Config file support**: Override any keybinding via `[keys]` section in config.toml
- **Navigation keys**: j/k/up/down, g/G (top/bottom), Ctrl+d/u (page down/up)
- **Action keys**: Enter, o (browser), Space (checkout), y/Y (copy)
- **Filter keys**: /, Escape, s (star), m (mark), Ctrl+m/r/s/e (quick filters)
- **Tab keys**: t (new), d (close), u (undo), [/] (prev/next), 1-9 (switch)
- **UI keys**: ? (help), q (quit), r/R (refresh), p/P (preview), Ctrl+p (command palette)

### P2 - Should Have

- **Conflict detection**: Warn if same key bound to multiple actions
- **Help screen updates**: Show configured keybindings, not defaults
- **Unbound keys**: Allow setting a key to empty string to disable it

### P3 - Nice to Have

- **Key notation display**: Show "Ctrl+P" not "ctrl-p" in UI
- **Keybinding reset command**: Reset to defaults via command palette

## Technical Notes

### Keybinding Definition

```typescript
// src/keybindings/types.ts

/** All bindable actions */
export type KeyAction =
  // Navigation
  | "nav.down"
  | "nav.up"
  | "nav.top"
  | "nav.bottom"
  | "nav.pageDown"
  | "nav.pageUp"
  // Actions
  | "action.open"          // Enter - open in default tool
  | "action.browser"       // o - open in browser
  | "action.checkout"      // Space - checkout PR
  | "action.copyNumber"    // y - copy PR number
  | "action.copyUrl"       // Y - copy PR URL
  | "action.star"          // s - star/unstar author
  | "action.mark"          // m - mark/unmark PR
  | "action.refresh"       // r - refresh
  | "action.forceRefresh"  // R - force refresh
  // Filters
  | "filter.open"          // / - open filter bar
  | "filter.clear"         // Escape - clear filter
  | "filter.marked"        // Ctrl+m - show marked
  | "filter.recent"        // Ctrl+r - show recent
  | "filter.starred"       // Ctrl+s - show starred
  | "filter.expanded"      // Ctrl+e - expand/collapse
  // Tabs
  | "tab.new"              // t - new tab
  | "tab.close"            // d - close tab
  | "tab.undo"             // u - undo close
  | "tab.prev"             // [ - previous tab
  | "tab.next"             // ] - next tab
  | "tab.1" | "tab.2" | "tab.3" | "tab.4" | "tab.5" 
  | "tab.6" | "tab.7" | "tab.8" | "tab.9"
  // UI
  | "ui.help"              // ? - show help
  | "ui.quit"              // q - quit
  | "ui.preview"           // p - toggle preview
  | "ui.previewCycle"      // P - cycle preview position
  | "ui.commandPalette"    // Ctrl+p - command palette

/** Key combination */
export interface KeyCombo {
  key: string        // "q", "p", "return", "escape", "space", etc.
  ctrl?: boolean
  shift?: boolean
  // meta/alt not supported in most terminals
}

/** Parse a key string like "ctrl+p" into KeyCombo */
export function parseKeyCombo(str: string): KeyCombo

/** Check if a keyboard event matches a KeyCombo */
export function matchesKey(event: KeyEvent, combo: KeyCombo): boolean
```

### Default Keybindings

```typescript
// src/keybindings/defaults.ts

export const defaultBindings: Record<KeyAction, string> = {
  // Navigation
  "nav.down": "j",
  "nav.up": "k",
  "nav.top": "g",
  "nav.bottom": "G",
  "nav.pageDown": "ctrl+d",
  "nav.pageUp": "ctrl+u",
  
  // Actions
  "action.open": "return",
  "action.browser": "o",
  "action.checkout": "space",
  "action.copyNumber": "y",
  "action.copyUrl": "Y",
  "action.star": "s",
  "action.mark": "m",
  "action.refresh": "r",
  "action.forceRefresh": "R",
  
  // Filters
  "filter.open": "/",
  "filter.clear": "escape",
  "filter.marked": "ctrl+m",
  "filter.recent": "ctrl+r",
  "filter.starred": "ctrl+s",
  "filter.expanded": "ctrl+e",
  
  // Tabs
  "tab.new": "t",
  "tab.close": "d",
  "tab.undo": "u",
  "tab.prev": "[",
  "tab.next": "]",
  "tab.1": "1", "tab.2": "2", "tab.3": "3",
  "tab.4": "4", "tab.5": "5", "tab.6": "6",
  "tab.7": "7", "tab.8": "8", "tab.9": "9",
  
  // UI
  "ui.help": "?",
  "ui.quit": "q",
  "ui.preview": "p",
  "ui.previewCycle": "P",
  "ui.commandPalette": "ctrl+p",
}
```

### Config File Format

```toml
# ~/.config/presto/config.toml

[keys]
# Override any keybinding
"ui.quit" = "ctrl+q"
"nav.down" = "n"
"nav.up" = "e"           # Colemak-friendly
"action.browser" = "b"
"tab.new" = "ctrl+t"

# Disable a keybinding
"nav.pageDown" = ""
```

### Usage in Components

```typescript
// Before (hardcoded):
if (key.name === "j" || key.name === "down") {
  // move down
}

// After (configurable):
import { useKeybindings } from "../keybindings"

function MyComponent() {
  const keys = useKeybindings()
  
  useKeyboard((key) => {
    if (keys.matches(key, "nav.down") || key.name === "down") {
      // move down
    }
  })
}
```

### Keybindings Hook

```typescript
// src/keybindings/hook.ts

export function useKeybindings() {
  const config = useConfig()
  
  // Merge defaults with user config
  const bindings = useMemo(() => ({
    ...defaultBindings,
    ...config.keys,
  }), [config.keys])
  
  // Check if a key event matches an action
  const matches = useCallback((event: KeyEvent, action: KeyAction): boolean => {
    const binding = bindings[action]
    if (!binding) return false  // Unbound
    const combo = parseKeyCombo(binding)
    return matchesKey(event, combo)
  }, [bindings])
  
  // Get display string for an action (for help screen)
  const getKeyDisplay = useCallback((action: KeyAction): string => {
    const binding = bindings[action]
    if (!binding) return ""
    return formatKeyDisplay(binding)  // "ctrl+p" -> "Ctrl+P"
  }, [bindings])
  
  return { matches, getKeyDisplay, bindings }
}
```

## File Structure

```
src/
├── keybindings/
│   ├── index.ts          # Exports
│   ├── types.ts          # KeyAction, KeyCombo types
│   ├── defaults.ts       # Default keybindings
│   ├── parser.ts         # Parse "ctrl+p" strings
│   └── hook.ts           # useKeybindings hook
├── config/
│   └── schema.ts         # Update keys type
└── hooks/
    └── useKeyboardNav.ts # Update to use keybindings
```

## Migration Path

1. Create keybindings module with types and defaults
2. Create useKeybindings hook
3. Update useKeyboardNav.ts to use the hook (biggest change)
4. Update CommandPalette.tsx to use the hook
5. Update Help screen to show configured bindings
6. Update config schema to type-check key names
