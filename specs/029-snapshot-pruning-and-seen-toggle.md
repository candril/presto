# Snapshot Pruning & Seen Toggle

**Status**: In Progress

## Description

Two related changes:

1. **`v` keybinding** to toggle a PR's seen/unseen state — like marking an email as read without opening it. Same behavior as the existing command palette "Mark as unread" action, just a dedicated key.

2. **Snapshot pruning** to prevent `history.json` from growing unboundedly. Snapshots accumulate for every tracked PR (my PRs, marked, recently viewed). Old snapshots for merged/closed PRs that have been seen should be evicted.

3. **Remove recency gradient** — the 4-level title dimming (justNow/today/thisWeek/older) adds visual complexity without enough value. The unread dot `•` is the real signal. All PR titles get the same base color; marks and dots provide the differentiation.

## Out of Scope

- Auto-marking new (never-seen) PRs as unread
- Configurable pruning thresholds

## Capabilities

### P1 - Must Have

- **`v` keybinding**: Toggle seen/unseen on selected PR. Shows "Marked as read" / "Marked as unread" message.
- **Snapshot pruning**: On save, remove snapshots for PRs that are:
  - Merged or closed (terminal state)
  - AND seen (`hasChanges: false`)
  - AND `seenAt` older than 7 days
  - AND not marked (no mark letter)
- **Remove recency gradient**: All PR titles use `theme.text`. Marked PRs keep `theme.warning` (gold). The unread dot and mark letters handle visual differentiation.

### P2 - Should Have

- **Snapshot count cap**: Hard limit of 500 snapshots. If pruning by rules still leaves >500, evict oldest `seenAt` first.

## Technical Notes

### Pruning Logic

```typescript
export function pruneSnapshots(history: History): History {
  const now = Date.now()
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  const MAX_SNAPSHOTS = 500

  const pruned: Record<string, PRSnapshot> = {}
  for (const [prKey, snapshot] of Object.entries(history.prSnapshots)) {
    const isTerminal = snapshot.prState === "merged" || snapshot.prState === "closed"
    const isSeen = !snapshot.hasChanges
    const isOld = (now - new Date(snapshot.seenAt).getTime()) > SEVEN_DAYS
    const isMarked = prKey in (history.markedPRs ?? {})

    if (isTerminal && isSeen && isOld && !isMarked) {
      continue // prune
    }
    pruned[prKey] = snapshot
  }

  // Hard cap
  if (Object.keys(pruned).length > MAX_SNAPSHOTS) {
    const sorted = Object.entries(pruned)
      .sort(([, a], [, b]) => new Date(a.seenAt).getTime() - new Date(b.seenAt).getTime())
    const keep = sorted.slice(-MAX_SNAPSHOTS)
    return { ...history, prSnapshots: Object.fromEntries(keep) }
  }

  return { ...history, prSnapshots: pruned }
}
```

### Where Pruning Runs

Call `pruneSnapshots()` inside `saveHistory()` — prune before writing to disk.

## File Structure

```
src/
├── history/
│   └── loader.ts             # Add pruneSnapshots, call in saveHistory
├── notifications/
│   └── snapshots.ts          # (no changes needed)
├── keybindings/
│   ├── types.ts              # Add "action.toggleSeen" key action
│   └── defaults.ts           # Bind to "v"
├── hooks/
│   └── useKeyboardNav.ts     # Handle v key
├── commands/
│   └── definitions.ts        # Update shortcut display
├── components/
│   ├── PRList.tsx             # Remove recency gradient
│   └── HelpOverlay.tsx        # Add v to help
└── theme.ts                  # (keep recency colors for now, just unused)
```
