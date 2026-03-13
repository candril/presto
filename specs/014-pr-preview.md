# PR Preview

**Status**: Draft

## Description

Right-side preview panel showing PR details while navigating the list. Press `p` to toggle preview mode - once enabled, navigating with `j`/`k` automatically loads the preview for the selected PR. Previews are cached until the next refresh.

This provides a middle ground between the minimal list view and opening the full PR detail or external tool.

## Out of Scope

- Inline diff viewing (use external tool for that)
- Editing PR from preview (commenting, approving)
- Live updates while preview is open
- Multiple previews open at once

## Capabilities

### P1 - Must Have

- **Toggle preview mode**: `p` toggles preview panel on/off
- **Right side panel**: Preview appears in right panel, list stays on left
- **Auto-load on navigate**: When preview mode is on, `j`/`k` navigation loads preview for selected PR
- **Changed files**: List of files with `+N -M` line counts
- **Author info**: Author name, when PR was created
- **CI/Check status**: Overall status (pass/fail/pending) with failed check names
- **Reviewers**: Who reviewed, their verdict (approved/changes requested/pending)
- **Branch info**: Source and target branch (e.g., `feature-branch → main`)
- **Scroll preview**: `Ctrl-d`/`Ctrl-u` to scroll preview content half-page
- **Cache until refresh**: Preview data cached in memory, cleared on PR list refresh

### P2 - Should Have

- **Commits list**: List of commits with short messages
- **PR description**: Body text (truncated if long)
- **Merge conflicts**: Show warning if PR has conflicts
- **Comments count**: Number of review comments
- **Debounced loading**: 100-150ms debounce on navigation to avoid excessive API calls
- **Loading indicator**: Show spinner/loading state while fetching, keep previous preview visible

### P3 - Nice to Have

- **Prefetch adjacent**: While idle, prefetch prev/next PR previews
- **File tree view**: Group changed files by directory
- **Expandable sections**: Collapse/expand commits, files, description
- **Copy file path**: Shortcut to copy file path to clipboard
- **Jump to file in diff**: Select file and press Enter to open in external diff tool

## Layout

```
┌─ Header ───────────────────────────────────────────────────────────────┐
│ presto                                                    ↻ 2m ago    │
├─ PR List ─────────────────────────────┬─ Preview ──────────────────────┤
│ > #123 Fix auth bug      @alice  ✓ 2h │ alice → main                  │
│   #124 Add feature       @bob    ○ 1d │                               │
│   #125 Refactor utils    @carol  ✗ 3h │ ✓ Checks  ✓ Mergeable  💬 3   │
│   #126 Update docs       @dave   ✓ 4h │                               │
│   #127 Fix typo          @eve    ✓ 5h │ Reviews: ✓bob ○carol          │
│                                       │                               │
│                                       │ Files (4):                    │
│                                       │  M src/auth.ts      +30 -10   │
│                                       │  M src/login.ts     +15  -5   │
│                                       │  A src/utils.ts     +12  -0   │
│                                       │  D old/legacy.ts     +0 -25   │
│                                       │                               │
│                                       │ Commits (3):                  │
│                                       │  a1b2c3d Fix auth flow        │
│                                       │  e4f5g6h Add tests            │
│                                       │  i7j8k9l Cleanup              │
│                                       │                               │
│                                       │ Description:                  │
│                                       │  This PR fixes the auth...    │
├───────────────────────────────────────┴────────────────────────────────┤
│ p: close preview  Ctrl-d/u: scroll  Enter: open                       │
└────────────────────────────────────────────────────────────────────────┘
```

**Panel width**: ~45-50% of terminal width, or fixed ~50 characters minimum.

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `p` | List | Toggle preview mode on/off |
| `j`/`k` | List (preview on) | Navigate list + load preview |
| `Ctrl-d` | Preview | Scroll preview down half page |
| `Ctrl-u` | Preview | Scroll preview up half page |
| `Enter` | Preview | Open PR in external tool |
| `Escape` | Preview | Close preview mode |

## Technical Notes

### Preview Data Structure

```typescript
// src/types.ts additions
export interface PRPreview {
  /** Files changed with line counts */
  files: ChangedFile[]
  
  /** Commits in the PR */
  commits: Commit[]
  
  /** Author details */
  author: {
    login: string
    createdAt: string  // ISO date
  }
  
  /** Review status per reviewer */
  reviews: Review[]
  
  /** CI/check status */
  checks: CheckStatus
  
  /** PR description body */
  body: string
  
  /** Branch info */
  baseRef: string
  headRef: string
  
  /** Merge state */
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN"
  
  /** Comment counts */
  commentCount: number
  reviewCommentCount: number
}

export interface ChangedFile {
  path: string
  additions: number
  deletions: number
  status: "added" | "modified" | "deleted" | "renamed"
}

export interface Commit {
  oid: string        // Short SHA
  message: string    // First line only
  author: string
  committedAt: string
}

export interface Review {
  author: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING"
  submittedAt: string
}

export interface CheckStatus {
  overall: "success" | "failure" | "pending" | "neutral"
  checks: Check[]
}

export interface Check {
  name: string
  status: "success" | "failure" | "pending" | "neutral"
  /** Only present if failed */
  failureMessage?: string
}
```

### State

```typescript
// src/state.ts additions
export interface AppState {
  // ... existing
  
  /** Preview mode enabled */
  previewMode: boolean
  
  /** Cache of loaded previews, keyed by "owner/repo#number" */
  previewCache: Map<string, PRPreview>
  
  /** Currently loading preview for this PR key */
  previewLoading: string | null
  
  /** Scroll offset for preview panel */
  previewScrollOffset: number
}

export type AppAction =
  // ... existing
  | { type: "TOGGLE_PREVIEW_MODE" }
  | { type: "SET_PREVIEW_CACHE"; key: string; data: PRPreview }
  | { type: "SET_PREVIEW_LOADING"; key: string | null }
  | { type: "CLEAR_PREVIEW_CACHE" }
  | { type: "SCROLL_PREVIEW"; delta: number }

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "TOGGLE_PREVIEW_MODE":
      return { 
        ...state, 
        previewMode: !state.previewMode,
        previewScrollOffset: 0,
      }
    
    case "SET_PREVIEW_CACHE":
      const newCache = new Map(state.previewCache)
      newCache.set(action.key, action.data)
      return { ...state, previewCache: newCache }
    
    case "SET_PREVIEW_LOADING":
      return { ...state, previewLoading: action.key }
    
    case "CLEAR_PREVIEW_CACHE":
      return { ...state, previewCache: new Map() }
    
    case "SCROLL_PREVIEW":
      return { 
        ...state, 
        previewScrollOffset: Math.max(0, state.previewScrollOffset + action.delta)
      }
    
    // ... existing cases
  }
}
```

### Preview Hook with Caching and Debounce

```typescript
// src/hooks/usePreview.ts
import { useEffect, useRef } from "react"
import { fetchPRPreview } from "../providers/github"
import type { PR } from "../types"
import type { AppState, AppAction } from "../state"

interface UsePreviewOptions {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  selectedPR: PR | null
}

export function usePreview({ state, dispatch, selectedPR }: UsePreviewOptions) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  useEffect(() => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    // Only fetch if preview mode is on and we have a selected PR
    if (!state.previewMode || !selectedPR) {
      return
    }
    
    const cacheKey = `${selectedPR.repository.nameWithOwner}#${selectedPR.number}`
    
    // If already cached, no need to fetch
    if (state.previewCache.has(cacheKey)) {
      dispatch({ type: "SET_PREVIEW_LOADING", key: null })
      return
    }
    
    // Debounce the fetch
    debounceRef.current = setTimeout(async () => {
      dispatch({ type: "SET_PREVIEW_LOADING", key: cacheKey })
      
      try {
        const preview = await fetchPRPreview(
          selectedPR.repository.nameWithOwner,
          selectedPR.number
        )
        dispatch({ type: "SET_PREVIEW_CACHE", key: cacheKey, data: preview })
      } catch (error) {
        console.error("Failed to fetch preview:", error)
      } finally {
        dispatch({ type: "SET_PREVIEW_LOADING", key: null })
      }
    }, 150) // 150ms debounce
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [state.previewMode, selectedPR?.number, selectedPR?.repository.nameWithOwner])
  
  // Get current preview from cache
  const currentKey = selectedPR 
    ? `${selectedPR.repository.nameWithOwner}#${selectedPR.number}`
    : null
  
  return {
    preview: currentKey ? state.previewCache.get(currentKey) ?? null : null,
    loading: state.previewLoading === currentKey,
  }
}
```

### Clear Cache on Refresh

```typescript
// When refreshing PR list, clear preview cache
async function handleRefresh() {
  dispatch({ type: "CLEAR_PREVIEW_CACHE" })
  dispatch({ type: "SET_LOADING", loading: true })
  
  const prs = await fetchPRs(config.repositories)
  dispatch({ type: "SET_PRS", prs })
  dispatch({ type: "SET_LOADING", loading: false })
}
```

### GitHub CLI Query

```typescript
// src/providers/github.ts
export async function fetchPRPreview(repo: string, number: number): Promise<PRPreview> {
  const result = await $`gh pr view ${number} \
    --repo ${repo} \
    --json files,commits,author,reviews,statusCheckRollup,body,baseRefName,headRefName,mergeable,comments,reviewComments,createdAt`.json()
  
  return {
    files: result.files.map((f: any) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status.toLowerCase(),
    })),
    commits: result.commits.map((c: any) => ({
      oid: c.oid.slice(0, 7),
      message: c.messageHeadline,
      author: c.authors?.[0]?.login ?? "unknown",
      committedAt: c.committedDate,
    })),
    author: {
      login: result.author.login,
      createdAt: result.createdAt,
    },
    reviews: dedupeReviews(result.reviews),
    checks: parseChecks(result.statusCheckRollup),
    body: result.body ?? "",
    baseRef: result.baseRefName,
    headRef: result.headRefName,
    mergeable: result.mergeable,
    commentCount: result.comments?.length ?? 0,
    reviewCommentCount: result.reviewComments?.length ?? 0,
  }
}

/** Keep only latest review per author */
function dedupeReviews(reviews: any[]): Review[] {
  const byAuthor = new Map<string, any>()
  for (const r of reviews) {
    const existing = byAuthor.get(r.author.login)
    if (!existing || new Date(r.submittedAt) > new Date(existing.submittedAt)) {
      byAuthor.set(r.author.login, r)
    }
  }
  return [...byAuthor.values()].map(r => ({
    author: r.author.login,
    state: r.state,
    submittedAt: r.submittedAt,
  }))
}

function parseChecks(rollup: any[]): CheckStatus {
  if (!rollup || rollup.length === 0) {
    return { overall: "neutral", checks: [] }
  }
  
  const checks: Check[] = rollup.map((c) => ({
    name: c.name || c.context,
    status: mapCheckStatus(c.status || c.state, c.conclusion),
  }))
  
  const hasFailure = checks.some(c => c.status === "failure")
  const hasPending = checks.some(c => c.status === "pending")
  const overall = hasFailure ? "failure" : hasPending ? "pending" : "success"
  
  return { overall, checks }
}

function mapCheckStatus(status: string, conclusion?: string): Check["status"] {
  if (status === "COMPLETED") {
    if (conclusion === "SUCCESS") return "success"
    if (conclusion === "FAILURE") return "failure"
    return "neutral"
  }
  if (status === "IN_PROGRESS" || status === "QUEUED" || status === "PENDING") {
    return "pending"
  }
  return "neutral"
}
```

### Preview Panel Component

```tsx
// src/components/PreviewPanel.tsx
import { useKeyboard } from "@opentui/react"
import type { PRPreview } from "../types"
import { theme } from "../theme"

interface PreviewPanelProps {
  preview: PRPreview | null
  loading: boolean
  scrollOffset: number
  onScroll: (delta: number) => void
  terminalHeight: number
}

export function PreviewPanel({ 
  preview, 
  loading, 
  scrollOffset, 
  onScroll,
  terminalHeight,
}: PreviewPanelProps) {
  const halfPage = Math.floor((terminalHeight - 4) / 2)
  
  useKeyboard((key) => {
    if (key.ctrl && key.name === "d") {
      onScroll(halfPage)
    }
    if (key.ctrl && key.name === "u") {
      onScroll(-halfPage)
    }
  })
  
  if (loading && !preview) {
    return (
      <box 
        width="50%" 
        border={{ type: "rounded", fg: theme.border }}
        padding={1}
      >
        <text fg={theme.textDim}>Loading...</text>
      </box>
    )
  }
  
  if (!preview) {
    return (
      <box 
        width="50%" 
        border={{ type: "rounded", fg: theme.border }}
        padding={1}
      >
        <text fg={theme.textDim}>No preview</text>
      </box>
    )
  }
  
  return (
    <box 
      width="50%"
      border={{ type: "rounded", fg: theme.primary }}
      flexDirection="column"
      padding={1}
    >
      <scrollbox scrollOffset={scrollOffset} flexGrow={1}>
        {/* Header: Branch info */}
        <box height={1} marginBottom={1}>
          <text>
            <span fg={theme.primary}>{preview.author.login}</span>
            <span fg={theme.textDim}> → </span>
            <span fg={theme.secondary}>{preview.baseRef}</span>
            {loading && <span fg={theme.warning}> ↻</span>}
          </text>
        </box>
        
        {/* Status Row */}
        <box height={1} marginBottom={1}>
          <ChecksIndicator checks={preview.checks} />
          <MergeableIndicator state={preview.mergeable} />
          <CommentsIndicator count={preview.commentCount + preview.reviewCommentCount} />
        </box>
        
        {/* Reviewers */}
        {preview.reviews.length > 0 && (
          <box height={1} marginBottom={1}>
            <text>
              <span fg={theme.textDim}>Reviews: </span>
              {preview.reviews.map((r) => (
                <ReviewBadge key={r.author} review={r} />
              ))}
            </text>
          </box>
        )}
        
        {/* Files */}
        <box flexDirection="column" marginBottom={1}>
          <text fg={theme.textMuted}>Files ({preview.files.length}):</text>
          {preview.files.map((file) => (
            <FileRow key={file.path} file={file} />
          ))}
        </box>
        
        {/* Commits */}
        {preview.commits.length > 0 && (
          <box flexDirection="column" marginBottom={1}>
            <text fg={theme.textMuted}>Commits ({preview.commits.length}):</text>
            {preview.commits.slice(0, 8).map((commit) => (
              <box key={commit.oid} height={1}>
                <text>
                  <span fg={theme.secondary}>{commit.oid}</span>
                  <span fg={theme.text}> {truncate(commit.message, 40)}</span>
                </text>
              </box>
            ))}
            {preview.commits.length > 8 && (
              <text fg={theme.textDim}>
                +{preview.commits.length - 8} more
              </text>
            )}
          </box>
        )}
        
        {/* Description */}
        {preview.body && (
          <box flexDirection="column">
            <text fg={theme.textMuted}>Description:</text>
            <text fg={theme.text}>{formatDescription(preview.body)}</text>
          </box>
        )}
      </scrollbox>
      
      {/* Footer */}
      <box height={1} borderTop={{ type: "single", fg: theme.border }}>
        <text fg={theme.textDim}>
          Ctrl-d/u: scroll  p: close
        </text>
      </box>
    </box>
  )
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + "…" : str
}

function formatDescription(body: string): string {
  // Collapse multiple newlines, truncate
  return body.replace(/\n{3,}/g, "\n\n").slice(0, 500)
}
```

### Layout Integration

```tsx
// In App.tsx
<box flexDirection="row" flexGrow={1}>
  {/* PR List - shrinks when preview is open */}
  <box width={state.previewMode ? "50%" : "100%"} flexDirection="column">
    <PRList
      prs={filteredPRs}
      selectedIndex={state.selectedIndex}
    />
  </box>
  
  {/* Preview Panel - only when preview mode is on */}
  {state.previewMode && (
    <PreviewPanel
      preview={preview}
      loading={previewLoading}
      scrollOffset={state.previewScrollOffset}
      onScroll={(delta) => dispatch({ type: "SCROLL_PREVIEW", delta })}
      terminalHeight={terminalHeight}
    />
  )}
</box>
```

## File Structure

```
src/
├── types.ts                    # Add PRPreview types
├── state.ts                    # Add preview state + cache
├── providers/
│   └── github.ts               # Add fetchPRPreview
├── hooks/
│   └── usePreview.ts           # Preview loading + caching hook
├── components/
│   └── PreviewPanel.tsx        # Right-side preview panel
└── App.tsx                     # Wire up preview mode
```

## User Experience Flow

1. User navigates PR list with `j`/`k`
2. User presses `p` → preview mode enabled, right panel appears
3. Preview loads for current PR (debounced 150ms)
4. User presses `j` → moves to next PR, preview loads (from cache or API)
5. User presses `Ctrl-d` → scrolls preview down half page
6. User presses `p` or `Escape` → preview mode off, panel closes
7. User presses `r` to refresh → cache cleared, fresh data on next preview

## Data Fetched from GitHub

All data comes from a single `gh pr view` call with these JSON fields:

| Field | Maps To |
|-------|---------|
| `files` | Changed files with additions/deletions |
| `commits` | Commit list |
| `author` | Author info |
| `createdAt` | When PR was created |
| `reviews` | Reviewer verdicts |
| `statusCheckRollup` | CI/check status |
| `body` | PR description |
| `baseRefName` | Target branch |
| `headRefName` | Source branch |
| `mergeable` | Conflict state |
| `comments` | Comment count |
| `reviewComments` | Review comment count |
