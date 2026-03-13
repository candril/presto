# External Tools

**Status**: In Progress (P1 Done)

## Description

Open pull requests in external tools - browser, riff for code review, or any configured CLI tool. The core action capability of presto.

## Out of Scope

- Built-in diff viewer (use riff)
- Built-in commenting (use browser/riff)
- Tool configuration UI (edit config file)

## Capabilities

### P1 - Must Have

- **Open in browser**: `o` to open PR in default browser via `gh pr view --web`
- **Open in riff**: `r` to open PR in riff for code review
- **Copy URL**: `y` to copy PR URL to clipboard

### P2 - Should Have

- **Configurable tools**: Define custom tools in config
- **Tool picker**: Quick menu to choose tool
- **Status feedback**: Show "Opening..." message

### P3 - Nice to Have

- **Recent tools**: Remember last used tool per PR
- **Quick actions menu**: Popup with all actions

## Technical Notes

### Tool Execution

```typescript
// src/actions/tools.ts
import { $ } from "bun"
import type { PR } from "../providers/github"

export async function openInBrowser(pr: PR): Promise<void> {
  await $`gh pr view ${pr.number} -R ${pr.repository.nameWithOwner} --web`
}

export async function openInRiff(pr: PR): Promise<void> {
  const target = `gh:${pr.repository.nameWithOwner}#${pr.number}`
  await $`riff ${target}`
}

export async function copyPRUrl(pr: PR): Promise<void> {
  const url = `https://github.com/${pr.repository.nameWithOwner}/pull/${pr.number}`
  // Use pbcopy on macOS, xclip on Linux
  if (process.platform === "darwin") {
    await $`echo ${url} | pbcopy`
  } else {
    await $`echo ${url} | xclip -selection clipboard`
  }
}

export async function openInCustomTool(pr: PR, command: string): Promise<void> {
  // Replace placeholders in command
  const expandedCommand = command
    .replace("{repo}", pr.repository.nameWithOwner)
    .replace("{number}", String(pr.number))
    .replace("{url}", `https://github.com/${pr.repository.nameWithOwner}/pull/${pr.number}`)
  
  await $`sh -c ${expandedCommand}`
}
```

### Keyboard Handling

```tsx
// In App.tsx
useKeyboard((key) => {
  if (key.name === "q") {
    renderer.destroy()
    return
  }
  
  const selectedPR = state.prs[state.selectedIndex]
  if (!selectedPR) return
  
  switch (key.name) {
    case "o":
      // Open in browser
      openInBrowser(selectedPR)
      break
    case "r":
      // Open in riff (suspends TUI)
      renderer.suspend()
      openInRiff(selectedPR).finally(() => {
        renderer.resume()
      })
      break
    case "y":
      // Copy URL
      copyPRUrl(selectedPR)
      dispatch({ type: "SHOW_MESSAGE", message: "URL copied!" })
      break
    case "enter":
      // Toggle detail view
      if (state.viewMode === "list") {
        dispatch({ type: "SET_VIEW", mode: "detail" })
      }
      break
    case "escape":
      if (state.viewMode === "detail") {
        dispatch({ type: "SET_VIEW", mode: "list" })
      }
      break
  }
})
```

### Config Schema

```typescript
// src/config/schema.ts
export interface Config {
  tools: {
    browser?: string       // Custom browser command
    riff?: string          // Path to riff binary
    custom?: {
      [name: string]: {
        command: string    // Command with {repo}, {number}, {url} placeholders
        key?: string       // Keyboard shortcut
      }
    }
  }
  defaultTool?: "browser" | "riff" | string  // Default on Enter
}

export const defaultConfig: Config = {
  tools: {
    riff: "riff",
  },
  defaultTool: "browser",
}
```

### Suspend/Resume for TUI Tools

When opening riff (or any TUI tool), we need to suspend presto:

```typescript
// Opening a TUI tool
async function openTUITool(pr: PR) {
  const renderer = useRenderer()
  
  renderer.suspend()  // Hide presto, restore terminal
  
  try {
    await openInRiff(pr)  // riff takes over terminal
  } finally {
    renderer.resume()  // Restore presto
  }
}
```

## File Structure

```
src/
├── actions/
│   └── tools.ts           # Tool execution functions
├── config/
│   ├── schema.ts          # Config types
│   └── loader.ts          # Load config from file
└── App.tsx                # Add keyboard handlers
```
