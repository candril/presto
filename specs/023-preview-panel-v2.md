# Preview Panel v2

**Status**: Done

## Description

Align presto's preview panel with riff's PRInfoPanel design, then add "new" indicators to highlight unseen comments and status changes. The preview panel should show PR metadata in a consistent, scannable format with clear visual hierarchy.

## Out of Scope

- Full collapsible sections (riff has Tab navigation between sections)
- Interactive comment replies
- Thread resolution
- Commit/file navigation from preview

## Current State (presto)

```
┌─ Preview ──────────────────────────────────────────────────────────┐
│ owner/repo #123                                                    │
│                                                                    │
│ [Change notification banner - if hasChanges]                       │
│                                                                    │
│ Comments (5):                                                      │
│ alice      2h LGTM! Just one small thing...                        │
│ bob        1h Good catch...                                        │
│                                                                    │
│ @alice wants to merge feature → main                               │
│ ✓ Checks  Mergeable  5 comments                                   │
│ Reviews: ✓ bob ✗ charlie                                          │
│ Description: ...                                                   │
│ Files: ...                                                         │
│ Commits: ...                                                       │
└────────────────────────────────────────────────────────────────────┘
```

## Target State (aligned with riff)

```
┌─ Preview ──────────────────────────────────────────────────────────┐
│ Fix authentication bug in login flow                               │
│ ─────────────────────────────────────────────────────────────────  │
│ Status      Open                                                   │
│ Author      @alice                                                 │
│ Branch      feature-auth → main                                    │
│ Changes     +42 -15 (3 files)                                      │
│ ─────────────────────────────────────────────────────────────────  │
│                                                                    │
│ [Change notification banner - if hasChanges]                       │
│                                                                    │
│ ▼ Conversation (3)                                                 │
│   ● @bob       2h  LGTM! Just one small thing about...            │ <- NEW
│   ● @charlie   1h  Good catch, I'll fix that                       │ <- NEW
│     @alice    30m  Thanks for the review!                          │
│                                                                    │
│ ▼ Reviews                                                          │
│   ✓ @bob approved                                                  │
│   ✗ @charlie requested changes                2h                   │
│   ○ @dave awaiting review                                          │
│                                                                    │
│ ▼ Description                                                      │
│   This PR fixes the auth bug by...                                 │
│                                                                    │
│ ▼ Files (3)                                                        │
│   M src/auth/login.ts                        +30/-10               │
│   A src/auth/utils.ts                        +12/-0                │
│   M tests/auth.test.ts                        +0/-5                │
│                                                                    │
│ ▼ Commits (2)                                                      │
│   abc1234  Fix login validation              2h                    │
│   def5678  Add auth utils                    1h                    │
├────────────────────────────────────────────────────────────────────┤
│ Ctrl-d/u: scroll  p: close  P: position                            │
└────────────────────────────────────────────────────────────────────┘
```

## Capabilities

### P1 - Must Have

- **Header section**: Title, separator, Status/Author/Branch/Changes rows (like riff)
- **New indicator on comments**: Show ● dot for comments with `createdAt > seenAt`
- **New indicator on changes**: Reuse existing change notification banner, but also mark specific items
- **Collapsible sections**: Description, Conversation, Files, Commits (visual only, all expanded)

### P2 - Should Have

- **Reviews section**: Show reviewers with state icons (✓ approved, ✗ changes requested, ○ pending)
- **Requested reviewers**: Show pending reviewers at end of reviews section
- **Time ago formatting**: Consistent compact format (2h, 1d, 2w)

### P3 - Nice to Have

- **Section collapse/expand**: Toggle sections with Enter (future)
- **Copy SHA**: Copy commit SHA from commits section (future)

## Technical Notes

### New Indicator Logic

```typescript
// In PreviewPanel.tsx

interface PreviewPanelProps {
  preview: PRPreview | null
  loading: boolean
  scrollOffset: number
  position: PreviewPosition
  changes?: DetectedChange[] | null
  seenAt?: string  // NEW: When user last "saw" this PR
}

// A comment is "new" if it was created after seenAt
function isNewComment(comment: PreviewComment, seenAt: string | undefined): boolean {
  if (!seenAt) return false
  return new Date(comment.createdAt) > new Date(seenAt)
}
```

### Updated Comment Row

```tsx
function CommentRow({ comment, bodyWidth, isNew }: { 
  comment: PreviewComment
  bodyWidth: number
  isNew: boolean 
}) {
  const timeAgo = formatTimeAgo(comment.createdAt)
  const author = comment.author.slice(0, 10).padEnd(10)
  const body = truncateCommentBody(comment.body, bodyWidth)
  const indicator = isNew ? "●" : " "
  const indicatorColor = isNew ? theme.primary : theme.textDim

  return (
    <box height={1}>
      <text>
        <span fg={indicatorColor}>{indicator} </span>
        <span fg={theme.primary}>{author}</span>
        <span fg={theme.textDim}>{timeAgo.padStart(4)} </span>
        <span fg={theme.text}>{body}</span>
      </text>
    </box>
  )
}
```

### Section Headers

```tsx
function SectionHeader({ title, count, expanded = true }: {
  title: string
  count?: number
  expanded?: boolean
}) {
  const icon = expanded ? "▼" : "▶"
  const countStr = count !== undefined ? ` (${count})` : ""
  
  return (
    <box height={1} marginTop={1}>
      <text fg={theme.textMuted}>{icon} {title}{countStr}</text>
    </box>
  )
}
```

### Reviews Section

```tsx
function ReviewsSection({ reviews, requestedReviewers }: {
  reviews: PRReview[]
  requestedReviewers?: string[]
}) {
  // Combine submitted reviews + pending reviewers
  const pending = (requestedReviewers ?? []).filter(
    r => !reviews.some(rev => rev.author === r)
  )
  
  return (
    <box flexDirection="column">
      <SectionHeader title="Reviews" />
      {reviews.map(review => (
        <ReviewRow key={review.author} review={review} />
      ))}
      {pending.map(reviewer => (
        <PendingReviewerRow key={reviewer} author={reviewer} />
      ))}
    </box>
  )
}

function ReviewRow({ review }: { review: PRReview }) {
  const { icon, color } = getReviewIcon(review.state)
  const stateLabel = review.state === "APPROVED" ? "approved" 
    : review.state === "CHANGES_REQUESTED" ? "requested changes"
    : "commented"
  
  return (
    <box height={1}>
      <text>
        <span fg={color}>{icon} </span>
        <span fg={theme.primary}>@{review.author}</span>
        <span fg={theme.textDim}> {stateLabel}</span>
        {review.submittedAt && (
          <span fg={theme.textMuted}>  {formatTimeAgo(review.submittedAt)}</span>
        )}
      </text>
    </box>
  )
}
```

### Passing seenAt to PreviewPanel

```tsx
// In App.tsx or wherever PreviewPanel is rendered
const prKey = selectedPR ? getPRKey(getRepoName(selectedPR), selectedPR.number) : null
const snapshot = prKey ? history.prSnapshots[prKey] : null

<PreviewPanel
  preview={previewData}
  loading={previewLoading}
  scrollOffset={previewScrollOffset}
  position={previewPosition}
  changes={snapshot?.changes}
  seenAt={snapshot?.seenAt}
/>
```

## Data Requirements

Need to extend `PRPreview` to include requested reviewers:

```typescript
// In types.ts
export interface PRPreview {
  // ... existing fields ...
  requestedReviewers?: string[]  // NEW
}
```

And fetch it in github.ts:

```typescript
const PREVIEW_FIELDS = [
  // ... existing ...
  "reviewRequests",  // NEW
]
```

## File Structure

```
src/
├── types.ts                    # Add requestedReviewers to PRPreview
├── providers/
│   └── github.ts               # Fetch reviewRequests, parse to string[]
├── components/
│   └── PreviewPanel.tsx        # Major refactor to match riff layout
└── App.tsx                     # Pass seenAt to PreviewPanel
```
