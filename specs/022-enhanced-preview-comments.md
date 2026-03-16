# Enhanced Preview Comments

**Status**: Done

## Description

Show recent comments in the preview panel banner area, providing a quick glance at PR activity. Display up to 5 comments with truncated single-line previews that use available horizontal space.

## Out of Scope

- Full comment threading
- Inline code comments with diff context
- Comment editing/replying
- Expanding comments to full view

## Capabilities

### P1 - Must Have

- **Fetch comments**: Load PR comments and review comments via GitHub API
- **Display in preview**: Show comments section in preview panel after change notifications
- **Single-line format**: Author, time ago, truncated body on one line
- **Limit to 5**: Cap at ~5 most recent comments
- **Use available width**: Truncate comment body to fit available horizontal space

### P2 - Should Have

- **Review comments**: Include review/diff comments, not just PR-level
- **Smart truncation**: Show meaningful prefix of comment body
- **Visual separation**: Clear section header for comments

### P3 - Nice to Have

- **Comment type indicator**: Icon for review vs PR comment
- **Author highlighting**: Highlight PR author's comments differently

## Layout

```
┌─ Preview ──────────────────────────────────────────────────────────┐
│ owner/repo #123                                                    │
│                                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │◇ 2 new comments                                                 ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                    │
│ Comments (5):                                                      │
│ alice  2h  LGTM! Just one small thing about the error handling... │
│ bob    1h  Good catch, I'll fix that in the next commit           │
│ alice  45m Actually, looking at this more, could you also add a...│
│ charlie 30m +1, this looks good to me now                         │
│ bob    10m Thanks for the review! Addressed all feedback          │
│                                                                    │
│ @alice wants to merge feature-branch → main                        │
│ ...                                                                │
└────────────────────────────────────────────────────────────────────┘
```

## Comment Format

```
{author}  {timeAgo}  {truncatedBody}
└──────┘  └──────┘   └────────────────────────────────────────────┘
 ~10ch    ~5ch       remaining width (flexible)
```

## Technical Notes

### Extended Preview Type

```typescript
// In src/types.ts - extend PRPreview
export interface PRPreview {
  // ... existing fields ...
  
  /** Recent comments for display */
  recentComments: PreviewComment[]
}

export interface PreviewComment {
  author: string
  body: string           // Full body (will be truncated in UI)
  createdAt: string      // ISO date
  isReviewComment: boolean
}
```

### Fetch Comments

```typescript
// In src/providers/github.ts

/** Fields to fetch for PR preview (extended) */
const PREVIEW_FIELDS = [
  // ... existing ...
  "comments",           // PR-level comments
  "reviews",            // Reviews with body
].join(",")

/** Parse comments for preview */
function parseComments(comments: any[], reviews: any[]): PreviewComment[] {
  const all: PreviewComment[] = []
  
  // PR-level comments
  for (const c of comments ?? []) {
    all.push({
      author: c.author?.login ?? "unknown",
      body: c.body ?? "",
      createdAt: c.createdAt ?? "",
      isReviewComment: false,
    })
  }
  
  // Review comments (from review body, not inline)
  for (const r of reviews ?? []) {
    if (r.body?.trim()) {
      all.push({
        author: r.author?.login ?? "unknown",
        body: r.body,
        createdAt: r.submittedAt ?? "",
        isReviewComment: true,
      })
    }
  }
  
  // Sort by date descending, take last 5
  return all
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .reverse()  // Show oldest first in UI
}
```

### Preview Panel Component

```tsx
// In src/components/PreviewPanel.tsx

function CommentsSection({ comments, maxWidth }: { comments: PreviewComment[], maxWidth: number }) {
  if (comments.length === 0) return null
  
  // Reserve space: author (~10) + gap (2) + time (~5) + gap (2) = ~19 chars
  const bodyWidth = Math.max(20, maxWidth - 19)
  
  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={theme.textMuted}>Comments ({comments.length}):</text>
      {comments.map((comment, i) => (
        <CommentRow key={i} comment={comment} bodyWidth={bodyWidth} />
      ))}
    </box>
  )
}

function CommentRow({ comment, bodyWidth }: { comment: PreviewComment, bodyWidth: number }) {
  const timeAgo = formatTimeAgo(comment.createdAt)
  const author = comment.author.slice(0, 10).padEnd(10)
  const body = truncateBody(comment.body, bodyWidth)
  
  return (
    <box height={1}>
      <text>
        <span fg={theme.primary}>{author}</span>
        <span fg={theme.textDim}>{timeAgo.padEnd(5)}</span>
        <span fg={theme.text}>{body}</span>
      </text>
    </box>
  )
}

/** Truncate comment body to single line */
function truncateBody(body: string, maxLen: number): string {
  // Remove newlines, collapse whitespace
  const oneLine = body.replace(/\s+/g, " ").trim()
  if (oneLine.length <= maxLen) return oneLine
  return oneLine.slice(0, maxLen - 1) + "…"
}

/** Format time ago (compact) */
function formatTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
```

## File Structure

```
src/
├── types.ts                    # Add PreviewComment type
├── providers/
│   └── github.ts               # Parse comments in fetchPRPreview
└── components/
    └── PreviewPanel.tsx        # Add CommentsSection component
```
