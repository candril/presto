# PR Preview

**Status**: Draft

## Description

Quick inline preview of a PR without leaving the list view. Press `p` on any PR row to expand a preview panel showing key details: changed files, commits, author, reviewers, CI status, description, and more. Press `p` again or `Escape` to collapse.

This provides a middle ground between the minimal list view and opening the full PR detail or external tool.

## Out of Scope

- Inline diff viewing (use external tool for that)
- Editing PR from preview (commenting, approving)
- Live updates while preview is open
- Multiple previews open at once

## Capabilities

### P1 - Must Have

- **Toggle preview**: `p` on PR row opens/closes preview panel
- **Changed files**: List of files with `+N -M` line counts
- **Author info**: Author name, when PR was created
- **CI/Check status**: Overall status (pass/fail/pending) with failed check names
- **Reviewers**: Who reviewed, their verdict (approved/changes requested/pending)
- **Base branch**: Target branch (e.g., `main`)
- **Close preview**: `Escape` or `p` closes preview

### P2 - Should Have

- **Commits list**: List of commits with short messages
- **PR description**: Body text (truncated if long, expandable)
- **Merge conflicts**: Show warning if PR has conflicts
- **Comments count**: Number of review comments
- **Head branch**: Source branch name
- **Scrollable content**: If preview content exceeds height, allow scrolling with `j`/`k`

### P3 - Nice to Have

- **File tree view**: Group changed files by directory
- **Expandable sections**: Collapse/expand commits, files, description
- **Copy file path**: Shortcut to copy file path to clipboard
- **Jump to file in diff**: Select file and press Enter to open in external diff tool
- **Syntax highlighting**: Highlight file extensions with colors

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

### GitHub CLI Query

```typescript
// src/providers/github.ts
export async function fetchPRPreview(repo: string, number: number): Promise<PRPreview> {
  const result = await $`gh pr view ${number} \
    --repo ${repo} \
    --json files,commits,author,reviews,statusCheckRollup,body,baseRefName,headRefName,mergeable,comments,reviewComments`.json()
  
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
    reviews: result.reviews.map((r: any) => ({
      author: r.author.login,
      state: r.state,
      submittedAt: r.submittedAt,
    })),
    checks: parseChecks(result.statusCheckRollup),
    body: result.body ?? "",
    baseRef: result.baseRefName,
    headRef: result.headRefName,
    mergeable: result.mergeable,
    commentCount: result.comments.length,
    reviewCommentCount: result.reviewComments.length,
  }
}

function parseChecks(rollup: any[]): CheckStatus {
  if (!rollup || rollup.length === 0) {
    return { overall: "neutral", checks: [] }
  }
  
  const checks: Check[] = rollup.map((c) => ({
    name: c.name || c.context,
    status: mapCheckStatus(c.status || c.state),
    failureMessage: c.conclusion === "FAILURE" ? c.name : undefined,
  }))
  
  const hasFailure = checks.some(c => c.status === "failure")
  const hasPending = checks.some(c => c.status === "pending")
  const overall = hasFailure ? "failure" : hasPending ? "pending" : "success"
  
  return { overall, checks }
}
```

### Preview Component

```tsx
// src/components/PRPreview.tsx
import type { PRPreview } from "../types"
import { theme } from "../theme"
import { formatRelativeTime } from "../utils/time"

interface PRPreviewProps {
  preview: PRPreview | null
  loading: boolean
  onClose: () => void
}

export function PRPreviewPanel({ preview, loading, onClose }: PRPreviewProps) {
  const [scrollOffset, setScrollOffset] = useState(0)
  
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "p") {
      onClose()
      return
    }
    if (key.name === "j") setScrollOffset(s => s + 1)
    if (key.name === "k") setScrollOffset(s => Math.max(0, s - 1))
  })
  
  if (loading) {
    return (
      <box border={{ type: "rounded", fg: theme.border }} padding={1}>
        <text fg={theme.textDim}>Loading preview...</text>
      </box>
    )
  }
  
  if (!preview) return null
  
  return (
    <box
      border={{ type: "rounded", fg: theme.primary }}
      flexDirection="column"
      padding={1}
      maxHeight={20}
    >
      {/* Header: Author + Branch */}
      <box height={1} marginBottom={1}>
        <text>
          <span fg={theme.primary}>{preview.author.login}</span>
          <span fg={theme.textDim}> wants to merge </span>
          <span fg={theme.secondary}>{preview.headRef}</span>
          <span fg={theme.textDim}> into </span>
          <span fg={theme.secondary}>{preview.baseRef}</span>
        </text>
      </box>
      
      {/* Status Row: Checks + Mergeable + Comments */}
      <box height={1} marginBottom={1}>
        <ChecksIndicator checks={preview.checks} />
        <MergeableIndicator state={preview.mergeable} />
        {(preview.commentCount > 0 || preview.reviewCommentCount > 0) && (
          <text fg={theme.textDim}>
            {" "}💬 {preview.commentCount + preview.reviewCommentCount}
          </text>
        )}
      </box>
      
      {/* Reviewers */}
      {preview.reviews.length > 0 && (
        <box height={1} marginBottom={1}>
          <text fg={theme.textDim}>Reviews: </text>
          {preview.reviews.map((r, i) => (
            <ReviewBadge key={r.author} review={r} />
          ))}
        </box>
      )}
      
      {/* Files Changed */}
      <box flexDirection="column" marginBottom={1}>
        <text fg={theme.textMuted}>
          Files changed ({preview.files.length}):
        </text>
        <scrollbox height={5} scrollOffset={scrollOffset}>
          {preview.files.map((file) => (
            <box key={file.path} height={1}>
              <text>
                <FileStatusIcon status={file.status} />
                <span fg={theme.text}> {file.path} </span>
                <span fg={theme.success}>+{file.additions}</span>
                <span fg={theme.textDim}>/</span>
                <span fg={theme.error}>-{file.deletions}</span>
              </text>
            </box>
          ))}
        </scrollbox>
      </box>
      
      {/* Commits (P2) */}
      {preview.commits.length > 0 && (
        <box flexDirection="column" marginBottom={1}>
          <text fg={theme.textMuted}>
            Commits ({preview.commits.length}):
          </text>
          {preview.commits.slice(0, 5).map((commit) => (
            <box key={commit.oid} height={1}>
              <text>
                <span fg={theme.secondary}>{commit.oid}</span>
                <span fg={theme.text}> {truncate(commit.message, 50)}</span>
              </text>
            </box>
          ))}
          {preview.commits.length > 5 && (
            <text fg={theme.textDim}>
              ... and {preview.commits.length - 5} more
            </text>
          )}
        </box>
      )}
      
      {/* Description (P2) */}
      {preview.body && (
        <box flexDirection="column">
          <text fg={theme.textMuted}>Description:</text>
          <text fg={theme.text}>{truncate(preview.body, 200)}</text>
        </box>
      )}
      
      {/* Footer hint */}
      <box height={1} marginTop={1}>
        <text fg={theme.textDim}>
          p/Esc: close  j/k: scroll  Enter: open in tool
        </text>
      </box>
    </box>
  )
}

function ChecksIndicator({ checks }: { checks: CheckStatus }) {
  const icon = checks.overall === "success" ? "✓" 
    : checks.overall === "failure" ? "✗"
    : checks.overall === "pending" ? "○"
    : "−"
  
  const color = checks.overall === "success" ? theme.success
    : checks.overall === "failure" ? theme.error
    : theme.warning
  
  const failedCount = checks.checks.filter(c => c.status === "failure").length
  
  return (
    <text>
      <span fg={color}>{icon}</span>
      <span fg={theme.textDim}> Checks</span>
      {failedCount > 0 && (
        <span fg={theme.error}> ({failedCount} failed)</span>
      )}
    </text>
  )
}

function MergeableIndicator({ state }: { state: string }) {
  if (state === "CONFLICTING") {
    return <text fg={theme.error}> ⚠ Conflicts</text>
  }
  if (state === "MERGEABLE") {
    return <text fg={theme.success}> ✓ Mergeable</text>
  }
  return null
}

function ReviewBadge({ review }: { review: Review }) {
  const icon = review.state === "APPROVED" ? "✓"
    : review.state === "CHANGES_REQUESTED" ? "✗"
    : "○"
  
  const color = review.state === "APPROVED" ? theme.success
    : review.state === "CHANGES_REQUESTED" ? theme.error
    : theme.warning
  
  return (
    <text>
      <span fg={color}>{icon}</span>
      <span fg={theme.text}>{review.author} </span>
    </text>
  )
}

function FileStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "added": return <span fg={theme.success}>A</span>
    case "deleted": return <span fg={theme.error}>D</span>
    case "renamed": return <span fg={theme.warning}>R</span>
    default: return <span fg={theme.secondary}>M</span>
  }
}
```

### State Integration

```typescript
// src/state.ts additions
export interface AppState {
  // ... existing
  
  /** Currently previewing PR number, null if closed */
  previewPR: number | null
  
  /** Loaded preview data */
  previewData: PRPreview | null
  
  /** Preview loading state */
  previewLoading: boolean
}

export type AppAction =
  // ... existing
  | { type: "OPEN_PREVIEW"; prNumber: number }
  | { type: "CLOSE_PREVIEW" }
  | { type: "SET_PREVIEW_DATA"; data: PRPreview }
  | { type: "SET_PREVIEW_LOADING"; loading: boolean }
```

### Keyboard Handler

```typescript
// In App.tsx or useKeyboard hook
useKeyboard((key) => {
  // Toggle preview
  if (key.name === "p" && !state.discoveryVisible) {
    if (state.previewPR !== null) {
      dispatch({ type: "CLOSE_PREVIEW" })
    } else {
      const pr = state.prs[state.selectedIndex]
      if (pr) {
        dispatch({ type: "OPEN_PREVIEW", prNumber: pr.number })
        dispatch({ type: "SET_PREVIEW_LOADING", loading: true })
        
        fetchPRPreview(pr.repository.nameWithOwner, pr.number)
          .then(data => {
            dispatch({ type: "SET_PREVIEW_DATA", data })
            dispatch({ type: "SET_PREVIEW_LOADING", loading: false })
          })
          .catch(() => {
            dispatch({ type: "SET_PREVIEW_LOADING", loading: false })
          })
      }
    }
    return
  }
})
```

### Layout Integration

```tsx
// In App.tsx - preview appears below selected PR row
<box flexDirection="column" flexGrow={1}>
  <PRList
    prs={filteredPRs}
    selectedIndex={state.selectedIndex}
    previewingPR={state.previewPR}
  />
  
  {state.previewPR !== null && (
    <PRPreviewPanel
      preview={state.previewData}
      loading={state.previewLoading}
      onClose={() => dispatch({ type: "CLOSE_PREVIEW" })}
    />
  )}
</box>
```

## File Structure

```
src/
├── types.ts                    # Add PRPreview types
├── state.ts                    # Add preview state
├── providers/
│   └── github.ts               # Add fetchPRPreview
├── components/
│   ├── PRPreview.tsx           # New: preview panel component
│   └── PRList.tsx              # Update: highlight previewing row
└── App.tsx                     # Wire up preview toggle
```

## User Experience Flow

1. User navigates to PR row with `j`/`k`
2. User presses `p` - preview panel expands below the row
3. Preview shows loading state briefly, then content
4. User can scroll preview content with `j`/`k`
5. User presses `p` or `Escape` to close preview
6. User can move to different PR and press `p` to preview that one instead

## Data Fetched from GitHub

All data comes from a single `gh pr view` call with these JSON fields:

| Field | Maps To |
|-------|---------|
| `files` | Changed files with additions/deletions |
| `commits` | Commit list |
| `author` | Author info |
| `reviews` | Reviewer verdicts |
| `statusCheckRollup` | CI/check status |
| `body` | PR description |
| `baseRefName` | Target branch |
| `headRefName` | Source branch |
| `mergeable` | Conflict state |
| `comments` | Comment count |
| `reviewComments` | Review comment count |
