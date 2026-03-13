# App Shell

**Status**: Done

## Description

Basic application shell for presto using OpenTUI React. Establishes the foundational layout, keyboard handling, and entry point that all other features build upon.

## Out of Scope

- Fetching data from GitHub (spec 002)
- PR detail view (spec 003)
- External tool integration (spec 004)
- Search and filter (spec 005)

## Capabilities

### P1 - Must Have

- **Entry point**: `src/index.tsx` with `createRoot().render()`
- **App component**: Main `App.tsx` with state management
- **Shell layout**: Header, main content area, status bar
- **Keyboard handling**: Quit on `q`, basic navigation hints
- **Theme constants**: Color palette for consistent styling

### P2 - Should Have

- **Responsive layout**: Adapt to terminal size changes
- **Loading state**: Show loading indicator while fetching
- **Error handling**: Display errors gracefully

### P3 - Nice to Have

- **Help modal**: Show keybindings on `?`
- **Theme switching**: Light/dark mode based on terminal

## Technical Notes

### Entry Point

```tsx
// src/index.tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)
```

### App Component

```tsx
// src/App.tsx
import { useReducer } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { appReducer, initialState } from "./state"

export function App() {
  const renderer = useRenderer()
  const [state, dispatch] = useReducer(appReducer, initialState)
  
  useKeyboard((key) => {
    if (key.name === "q") {
      renderer.destroy()
      return
    }
  })
  
  return (
    <Shell>
      <Header title="presto" />
      <box flexGrow={1}>
        <text>Welcome to presto</text>
      </box>
      <StatusBar hints={["q: quit", "?: help"]} />
    </Shell>
  )
}
```

### Shell Component

```tsx
// src/components/Shell.tsx
import type { ReactNode } from "react"

interface ShellProps {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <box width="100%" height="100%" flexDirection="column">
      {children}
    </box>
  )
}
```

### Theme

```typescript
// src/theme.ts
export const theme = {
  // Backgrounds
  bg: "#1a1b26",
  headerBg: "#24283b",
  
  // Text
  text: "#c0caf5",
  textDim: "#565f89",
  textMuted: "#414868",
  
  // Accents
  primary: "#7aa2f7",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
  
  // Semantic
  prOpen: "#9ece6a",
  prMerged: "#bb9af7",
  prClosed: "#f7768e",
  prDraft: "#565f89",
}
```

## File Structure

```
src/
├── index.tsx           # Entry point
├── App.tsx             # Main app component
├── state.ts            # useReducer state
├── types.ts            # Type definitions
├── theme.ts            # Color constants
└── components/
    ├── Shell.tsx       # Root layout
    ├── Header.tsx      # Title bar
    └── StatusBar.tsx   # Bottom hints
```
