# Manual Unread Toggle

**Status**: Done

## Description

Allow users to manually toggle the notification dot (unread/read state) on PRs via the command palette. This provides a "mark as unread" workflow similar to email clients, useful for PRs that need follow-up attention.

## Out of Scope

- Keyboard shortcut (use command palette only)
- Batch operations (mark multiple as unread)
- Custom notification types

## Capabilities

### P1 - Must Have

- **Toggle unread state**: Command palette action to mark PR as unread/read
- **Visual indicator**: Reuse existing notification dot for manually marked PRs
- **Persistence**: Save unread state to history

### P2 - Should Have

- **Smart label**: Show "Mark as unread" when read, "Mark as read" when unread
- **Filter integration**: `>unread` filter shows manually marked + auto-detected changes

### P3 - Nice to Have

- **Unread count in status bar**: Show count of unread PRs

## Technical Notes

### Toggling Unread State

```typescript
// src/notifications/snapshots.ts

/** Toggle the unread/hasChanges state manually */
export function togglePRUnread(history: History, prKey: string): History {
  const snapshot = history.prSnapshots[prKey]
  
  if (!snapshot) {
    // Create a minimal snapshot with hasChanges = true
    return {
      ...history,
      prSnapshots: {
        ...history.prSnapshots,
        [prKey]: {
          prState: "ready",
          reviewDecision: null,
          checkState: "NONE",
          commentCount: 0,
          snapshotAt: new Date().toISOString(),
          seenAt: new Date().toISOString(),
          hasChanges: true,
          changes: [{ type: "manual", message: "Marked as unread" }],
        },
      },
    }
  }
  
  // Toggle hasChanges
  const wasUnread = snapshot.hasChanges
  return {
    ...history,
    prSnapshots: {
      ...history.prSnapshots,
      [prKey]: {
        ...snapshot,
        hasChanges: !wasUnread,
        changes: wasUnread ? undefined : [{ type: "manual", message: "Marked as unread" }],
        seenAt: wasUnread ? new Date().toISOString() : snapshot.seenAt,
      },
    },
  }
}
```

### Command Definition

```typescript
// In src/commands/definitions.ts
{
  id: "action.toggle_unread",
  label: "Mark as unread", // Dynamic based on state
  category: "action",
  requiresPR: true,
  execute: async (ctx) => {
    const prKey = getPRKey(getRepoName(ctx.selectedPR!), ctx.selectedPR!.number)
    const wasUnread = prHasChanges(ctx.history, prKey)
    const newHistory = togglePRUnread(ctx.history, prKey)
    ctx.setHistory(newHistory)
    saveHistory(newHistory)
    return {
      type: "success",
      message: wasUnread ? "Marked as read" : "Marked as unread",
    }
  },
  // Dynamic label based on current state
  getLabel: (ctx) => {
    const prKey = getPRKey(getRepoName(ctx.selectedPR!), ctx.selectedPR!.number)
    const isUnread = prHasChanges(ctx.history, prKey)
    return isUnread ? "Mark as read" : "Mark as unread"
  },
},
```

### Change Type Extension

```typescript
// In src/history/schema.ts - extend ChangeType
export type ChangeType =
  | "new_comments"
  | "approved"
  // ... existing types ...
  | "manual"  // NEW: manually marked as unread
```

## File Structure

```
src/
├── history/
│   └── schema.ts           # Add "manual" change type
├── notifications/
│   └── snapshots.ts        # Add togglePRUnread function
└── commands/
    └── definitions.ts      # Add toggle_unread command
```
