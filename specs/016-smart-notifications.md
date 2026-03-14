# Smart Notifications

**Status**: Ready

## Description

Surface changes to PRs you care about. When a marked or recently viewed PR changes state (merged, approved, CI failed, etc.), show a toast notification and a subtle dot indicator in the list.

Two complementary mechanisms:
1. **Toast**: Appears on startup, resume, or after refresh finds changes. Auto-dismisses.
2. **Dot indicator**: Subtle dot in PR list that persists until you select/view the PR.

## Out of Scope

- Desktop/system notifications
- Sound alerts
- Email/webhook integrations

## Capabilities

### P1 - Must Have

#### Tracking
- Track state snapshots for PRs in `markedPRs` or `recentlyViewed`
- Detect changes: state (merged/closed), review decision, CI status
- Store snapshots in history.json

#### Toast
- Show toast on startup if changes since last session
- Show toast on resume from background (SIGCONT) if changes
- Show toast after auto-refresh if changes detected
- Auto-dismiss after 4 seconds or on any keypress
- Max 5 items, then "+ N more"

#### Dot Indicators
- Show dot before PR number for PRs with unseen changes
- Clear dot when PR is selected (cursor moves to it)
- Clear dot when PR is opened (Enter, `o`, etc.)

### P2 - Should Have

- Group similar changes in toast ("2 PRs were approved")
- Different dot colors for different change types (success/failure)
- `@changed` filter to show only PRs with unseen changes

### P3 - Nice to Have

- Notification history panel (`n` key)
- Configure which change types to track
- Mute notifications for specific PRs

## Technical Notes

### Which PRs Are Tracked

PRs are automatically tracked if they match ANY of:
1. **My PRs** - authored by current user (always tracked)
2. **Marked PRs** - manually pinned with `m`
3. **Recent PRs** - opened via Enter, `o`, or pasted URL

### What Counts as a Change

| Change | Notification Text | Relevant For |
|--------|-------------------|--------------|
| State: OPEN → MERGED | "was merged" | All |
| State: OPEN → CLOSED | "was closed" | All |
| Review: * → APPROVED | "was approved" | My PRs |
| Review: * → CHANGES_REQUESTED | "changes requested" | My PRs |
| CI: * → SUCCESS (was not SUCCESS) | "CI passed" | My PRs |
| CI: * → FAILURE (was not FAILURE) | "CI failed" | My PRs |
| Review requested from you | "needs your review" | Others' PRs |
| New comments (count increased) | "new comments" | My PRs |

### History Schema

```typescript
// src/history/schema.ts
export interface History {
  // ... existing fields
  
  /** Snapshots of tracked PR states for change detection */
  prSnapshots: Record<string, PRSnapshot>
}

export interface PRSnapshot {
  /** PR state: OPEN, MERGED, CLOSED */
  state: string
  /** Review decision: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, null */
  reviewDecision: string | null
  /** CI status: SUCCESS, FAILURE, PENDING, NONE */
  checkState: string
  /** Total comment count (comments + review comments) */
  commentCount: number
  /** When this snapshot was taken */
  snapshotAt: string  // ISO date
  /** When user last "saw" this PR (selected or opened) */
  seenAt: string  // ISO date
  /** Whether there are unseen changes */
  hasChanges: boolean
}
```

### Change Detection

```typescript
// src/notifications/detector.ts

export interface PRChange {
  prKey: string  // "owner/repo#123"
  pr: PR
  changeType: "merged" | "closed" | "approved" | "changes_requested" | "ci_passed" | "ci_failed" | "review_requested" | "new_comments"
  message: string  // "was approved", "CI failed", "2 new comments", etc.
}

export function detectChanges(
  prs: PR[],
  history: History,
  currentUser: string | null
): PRChange[] {
  const changes: PRChange[] = []
  
  // Build set of tracked PR keys
  const trackedKeys = new Set([
    ...history.markedPRs,
    ...history.recentlyViewed.map(r => `${r.repo}#${r.number}`)
  ])
  
  for (const pr of prs) {
    const prKey = getPRKey(pr)
    const isMine = currentUser && pr.author.login === currentUser
    const isTracked = trackedKeys.has(prKey)
    
    // Track all my PRs + explicitly tracked PRs
    if (!isMine && !isTracked) continue
    
    const snapshot = history.prSnapshots[prKey]
    if (!snapshot) continue  // First time seeing, no comparison
    
    // State changes (relevant for all tracked PRs)
    if (pr.state !== snapshot.state) {
      if (pr.state === "MERGED") {
        changes.push({ prKey, pr, changeType: "merged", message: "was merged" })
      } else if (pr.state === "CLOSED") {
        changes.push({ prKey, pr, changeType: "closed", message: "was closed" })
      }
    }
    
    // Review changes (most relevant for my PRs)
    if (pr.reviewDecision !== snapshot.reviewDecision) {
      if (pr.reviewDecision === "APPROVED") {
        changes.push({ prKey, pr, changeType: "approved", message: "was approved" })
      } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
        changes.push({ prKey, pr, changeType: "changes_requested", message: "changes requested" })
      }
    }
    
    // CI changes (most relevant for my PRs)
    const checkState = computeCheckState(pr.statusCheckRollup)
    if (checkState !== snapshot.checkState) {
      if (checkState === "SUCCESS" && snapshot.checkState !== "SUCCESS") {
        changes.push({ prKey, pr, changeType: "ci_passed", message: "CI passed" })
      } else if (checkState === "FAILURE" && snapshot.checkState !== "FAILURE") {
        changes.push({ prKey, pr, changeType: "ci_failed", message: "CI failed" })
      }
    }
    
    // New comments (for my PRs)
    if (isMine && pr.commentCount > snapshot.commentCount) {
      const newCount = pr.commentCount - snapshot.commentCount
      changes.push({ 
        prKey, 
        pr, 
        changeType: "new_comments", 
        message: `${newCount} new comment${newCount > 1 ? "s" : ""}` 
      })
    }
  }
  
  return changes
}
```

### Snapshot Updates

```typescript
// Update snapshot when PR is fetched (track current state)
export function updateSnapshot(history: History, pr: PR): History {
  const prKey = getPRKey(pr)
  const checkState = computeCheckState(pr.statusCheckRollup)
  
  const existing = history.prSnapshots[prKey]
  const now = new Date().toISOString()
  
  return {
    ...history,
    prSnapshots: {
      ...history.prSnapshots,
      [prKey]: {
        state: pr.state,
        reviewDecision: pr.reviewDecision,
        checkState,
        snapshotAt: now,
        seenAt: existing?.seenAt || now,
        hasChanges: existing?.hasChanges || false,
      }
    }
  }
}

// Mark PR as seen (clear hasChanges)
export function markPRSeen(history: History, prKey: string): History {
  const snapshot = history.prSnapshots[prKey]
  if (!snapshot) return history
  
  return {
    ...history,
    prSnapshots: {
      ...history.prSnapshots,
      [prKey]: {
        ...snapshot,
        seenAt: new Date().toISOString(),
        hasChanges: false,
      }
    }
  }
}
```

### Toast Component

```tsx
// src/components/NotificationToast.tsx

interface NotificationToastProps {
  changes: PRChange[]
  onDismiss: () => void
}

export function NotificationToast({ changes, onDismiss }: NotificationToastProps) {
  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])
  
  // Dismiss on any key
  useKeyboard(() => {
    onDismiss()
  })
  
  const visible = changes.slice(0, 5)
  const remaining = changes.length - visible.length
  
  return (
    <box
      position="absolute"
      top={2}
      right={2}
      width={45}
      flexDirection="column"
      backgroundColor={theme.modalBg}
      borderStyle="rounded"
      padding={1}
    >
      {visible.map((change) => (
        <NotificationRow key={change.prKey} change={change} />
      ))}
      {remaining > 0 && (
        <text fg={theme.textMuted}>+ {remaining} more</text>
      )}
    </box>
  )
}

function NotificationRow({ change }: { change: PRChange }) {
  const icon = getChangeIcon(change.changeType)
  const color = getChangeColor(change.changeType)
  
  return (
    <box height={1}>
      <text>
        <span fg={color}>{icon}</span>
        {" "}
        <span fg={theme.textDim}>#{change.pr.number}</span>
        {" "}
        <span fg={theme.text}>{truncate(change.pr.title, 20)}</span>
        {" "}
        <span fg={color}>{change.message}</span>
      </text>
    </box>
  )
}

function getChangeIcon(type: PRChange["changeType"]): string {
  switch (type) {
    case "merged": return "◆"
    case "closed": return "✕"
    case "approved": return "✓"
    case "changes_requested": return "!"
    case "ci_passed": return "✓"
    case "ci_failed": return "✗"
    case "review_requested": return "→"
    case "new_comments": return "💬"
  }
}

function getChangeColor(type: PRChange["changeType"]): string {
  switch (type) {
    case "merged": return theme.merged
    case "closed": return theme.textDim
    case "approved": return theme.success
    case "changes_requested": return theme.warning
    case "ci_passed": return theme.success
    case "ci_failed": return theme.error
    case "review_requested": return theme.primary
    case "new_comments": return theme.primary
  }
}
```

### Dot Indicator in PR List

```tsx
// In PRList.tsx / PRRow

function PRRow({ pr, selected, history }: PRRowProps) {
  const prKey = getPRKey(pr)
  const snapshot = history.prSnapshots[prKey]
  const hasChanges = snapshot?.hasChanges ?? false
  
  return (
    <box>
      <text>
        <span fg={hasChanges ? theme.primary : theme.textDim}>
          {hasChanges ? "•" : " "}
        </span>
        {/* ... rest of row */}
      </text>
    </box>
  )
}
```

### Integration with App

```tsx
// In App.tsx

function App() {
  const [pendingChanges, setPendingChanges] = useState<PRChange[]>([])
  
  // After refresh, detect changes
  const handleRefreshComplete = (prs: PR[]) => {
    const changes = detectChanges(prs, history, currentUser)
    if (changes.length > 0) {
      // Mark PRs as having changes
      let newHistory = history
      for (const change of changes) {
        newHistory = markPRHasChanges(newHistory, change.prKey)
      }
      setHistory(newHistory)
      saveHistory(newHistory)
      
      // Show toast
      setPendingChanges(changes)
    }
  }
  
  // Clear dot when PR is selected
  useEffect(() => {
    const selectedPR = filteredPRs[state.selectedIndex]
    if (selectedPR) {
      const prKey = getPRKey(selectedPR)
      if (history.prSnapshots[prKey]?.hasChanges) {
        const newHistory = markPRSeen(history, prKey)
        setHistory(newHistory)
        saveHistory(newHistory)
      }
    }
  }, [state.selectedIndex])
  
  return (
    <Shell>
      {/* ... */}
      {pendingChanges.length > 0 && (
        <NotificationToast
          changes={pendingChanges}
          onDismiss={() => setPendingChanges([])}
        />
      )}
    </Shell>
  )
}
```

### PR Type Update

Add `commentCount` to the PR list fields:

```typescript
// src/providers/github.ts
const PR_FIELDS = [
  // ... existing fields
  "comments",  // Add this - returns array, we count length
]

// src/types.ts
export interface PR {
  // ... existing fields
  /** Number of comments on the PR */
  commentCount: number
}
```

## File Structure

```
src/
├── notifications/
│   ├── index.ts              # Exports
│   ├── detector.ts           # Change detection logic
│   └── snapshots.ts          # Snapshot management
├── components/
│   └── NotificationToast.tsx # Toast component
├── providers/
│   └── github.ts             # Add comments field
├── types.ts                  # Add commentCount to PR
├── history/
│   └── schema.ts             # Add prSnapshots
└── App.tsx                   # Wire up notifications
```

## UI Examples

### Toast (top-right corner)
```
┌───────────────────────────────────────┐
│ ✓ #123 "Add auth" was approved        │
│ ✗ #456 "Fix bug" CI failed            │
│ → #789 "Update deps" needs your review│
│ + 2 more                              │
└───────────────────────────────────────┘
```

### Dot indicators in list
```
  #100 Old PR                   ✓  ●  2h  @alice
• #123 Add auth flow            ✓  ●  2h  @bob
  #200 Another PR               ○  ●  1d  @carol
• #456 Fix bug                  ✗  ●  3h  @dave
```

### After selecting #123 (dot clears)
```
  #100 Old PR                   ✓  ●  2h  @alice
> #123 Add auth flow            ✓  ●  2h  @bob    ← selected, dot cleared
  #200 Another PR               ○  ●  1d  @carol
• #456 Fix bug                  ✗  ●  3h  @dave
```
