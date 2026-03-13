# presto

A terminal-based pull request discovery and management tool built with OpenTUI React. Discover PRs, check their status, and launch them in your favorite tools.

## Spec-Driven Development

**All features must have a spec before implementation.**

### Workflow

1. **Write the spec first** - Create `specs/NNN-feature-name.md` following the template
2. **Review the spec** - Ensure it covers capabilities, technical notes, and file structure
3. **Implement by priority** - P1 first, then P2, then P3
4. **Mark progress** - Update spec status as you work

### Spec Structure

```markdown
# Feature Name

**Status**: Draft | Ready | In Progress | Done

## Description
What this feature does in 2-3 sentences.

## Out of Scope
What this feature explicitly does NOT do.

## Capabilities

### P1 - Must Have
- Core functionality

### P2 - Should Have
- Important enhancements

### P3 - Nice to Have
- Polish and extras

## Technical Notes
Implementation details, code examples, API usage.

## File Structure
Which files to create/modify.
```

### Spec Status Flow

1. `Draft` - Being written, not ready
2. `Ready` - Reviewed, ready for implementation
3. `In Progress` - Currently being implemented
4. `Done` - Complete, move to `specs/done/`

## Commands

Use `just` for common tasks:

| Command | Description |
|---------|-------------|
| `just run` | Run the app |
| `just dev` | Run with hot reload |
| `just test` | Run tests |
| `just typecheck` | Type check |
| `just build` | Build standalone binary |

## Version Control (jj)

This project uses jj (jujutsu) for version control.

> **SUPER IMPORTANT**: Before starting ANY new task or topic, you MUST create a new jj change!
> Run `jj new -m "Description of what you're about to do"` FIRST, before making any edits.
> This keeps changes atomic and easy to review. NO EXCEPTIONS!

### Before starting a task

1. **ALWAYS** run `jj status` first
2. **ALWAYS** create a new change: `jj new -m "Description of task"`
3. Only then start making edits

### While working

- Changes auto-tracked (no staging)
- Check status: `jj status`
- View history: `jj log`

### After completing a task

1. Verify: `jj diff`
2. Create new change: `jj new`

### Common commands

| Command | Description |
|---------|-------------|
| `jj status` | Show working copy changes |
| `jj log` | Show commit history |
| `jj diff` | Show current changes |
| `jj new -m "msg"` | Create new change with message |
| `jj describe -m "msg"` | Set/update current change message |
| `jj squash` | Squash into parent change. Do not squash interactively! IMPORTANT |
| `jj git push` | Push to remote |

## Tech Stack

### Runtime: Bun

Use Bun instead of Node.js:

- `bun <file>` to run TypeScript files
- `bun test` for testing
- `bun install` for dependencies
- Bun automatically loads `.env` files

### UI: OpenTUI React

Terminal UI built with `@opentui/react` using React reconciler pattern.

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer } from "@opentui/react"
import { useState } from "react"

function App() {
  const renderer = useRenderer()
  const [count, setCount] = useState(0)
  
  useKeyboard((key) => {
    if (key.name === "q") renderer.destroy()
    if (key.name === "j") setCount(c => c + 1)
    if (key.name === "k") setCount(c => c - 1)
  })
  
  return (
    <box width="100%" height="100%" flexDirection="column">
      <box height={1} backgroundColor="#1a1a2e">
        <text fg="#7aa2f7">presto</text>
      </box>
      <box flexGrow={1}>
        <text>Count: {count}</text>
      </box>
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)
```

#### Key Patterns

**JSX Elements** (not HTML!):
- `<text>` - Text content with `fg`, `bg` colors
- `<box>` - Flexbox container with `border`, `padding`, layout props
- `<scrollbox>` - Scrollable container
- `<input>` - Single-line input
- `<select>` - List selection
- `<code>` - Syntax-highlighted code

**Text Modifiers** (inside `<text>`):
```tsx
<text>
  <strong>Bold</strong>, <em>italic</em>, <u>underline</u>
  <span fg="red">Colored</span>
</text>
```

**Hooks**:
- `useRenderer()` - Access renderer for `destroy()`, dimensions
- `useKeyboard((key) => {})` - Handle keyboard input
- `useTerminalDimensions()` - Reactive terminal size
- `useTimeline()` - Animations

**State Management**:
- `useState` for simple state
- `useReducer` for complex state with actions
- React Context for global state

#### Critical Rules

1. **Never use `process.exit()`** - Use `renderer.destroy()` instead
2. **Text styling uses nested tags** - Not props on `<text>`
3. **Inputs must be `focused`** - Or they won't receive input
4. **Select options need `{ name: string }`** - Not plain strings

### GitHub: `gh` CLI

Use `gh` CLI for GitHub API access:

```typescript
import { $ } from "bun"

// List PRs
const prs = await $`gh pr list --json number,title,state,author`.json()

// Get PR details
const pr = await $`gh pr view ${number} --json title,body,state,checks`.json()

// Open PR in browser
await $`gh pr view ${number} --web`

// Get PR diff
const diff = await $`gh pr diff ${number}`.text()
```

### External Tools Integration

```typescript
// Open in riff
await $`riff gh:owner/repo#${number}`

// Open in browser
await $`gh pr view ${number} --web`

// Open in custom tool (configurable)
await $`${config.tools.prViewer} ${prUrl}`
```

## File Structure

```
src/
├── index.tsx             # Entry point with createRoot
├── App.tsx               # Main app component
├── state.ts              # App state (useReducer pattern)
├── types.ts              # Type definitions
├── theme.ts              # Colors and theme constants
├── hooks/
│   ├── useAppState.ts    # App state hook
│   └── useGitHub.ts      # GitHub data fetching
├── components/
│   ├── Shell.tsx         # Root layout
│   ├── Header.tsx        # Title bar
│   ├── StatusBar.tsx     # Bottom hints
│   ├── PRList.tsx        # Pull request list
│   ├── PRDetail.tsx      # PR detail view
│   └── SearchInput.tsx   # Search/filter input
├── providers/
│   └── github.ts         # GitHub API via gh CLI
└── config/
    ├── schema.ts         # Config types
    └── loader.ts         # Load config
```

## Skills

Load the OpenTUI skill for detailed component and API documentation:

```
.agents/skills/opentui/SKILL.md
```

The skill provides:
- Component reference (text, box, input, select, etc.)
- Hook documentation (useKeyboard, useRenderer, etc.)
- Layout patterns (flexbox, responsive)
- Keyboard handling patterns
- Testing guidance
