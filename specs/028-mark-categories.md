# Mark Categories (Letter-Based)

**Status**: In Progress

## Description

Evolve the existing single-mark system into letter-based mark categories, inspired by vim marks. Press `M` then a letter (`a-z`) to categorize a PR. Filter to a category with `marks:<letter>` in the search bar, or use `'<letter>` as a shortcut that populates the filter bar with `marks:<letter>`.

This replaces the boolean `>marked` system with something more expressive — you decide what each letter means ("d for deploy", "r for review") and can have multiple independent groups.

## Out of Scope

- Named aliases for letters (e.g. `d = "deploy"`) — just use bare letters
- More than 26 categories (a-z is plenty)
- Cloud sync of marks
- Uppercase letter marks (A-Z reserved for future use)

## Capabilities

### P1 - Must Have

- **Mark with letter**: `M` (Shift+M) enters "mark mode", then press `a-z` to toggle that letter on the current PR
- **Filter by mark**: `marks:<letter>` filter predicate (e.g. `marks:d` shows all PRs marked with `d`)
- **Quick filter shortcut**: `'<letter>` populates the filter bar with `marks:<letter>` (or clears if already filtering by that letter)
- **Visual indicator**: Show mark letter(s) in the PR list gutter (left of the change dot)
- **Single mark per PR**: Each PR has one mark letter. Marking with a new letter replaces the old one
- **Persistence**: Store in history.json
- **Migration**: Convert old `markedPRs: string[]` to new format on load
- **Backward compat**: `>marked` filter still works — shows all PRs with any mark letter
- **Feedback**: Show "Marked [d]" / "Unmarked [d]" message when toggling

### P2 - Should Have

- **Discovery suggestions**: When typing `marks:` in the filter bar, suggest existing mark letters with PR counts
- **List marks**: `''` (quote twice) shows all marks in a summary / clears filter
- **Composable**: `marks:d @alice` — deploy PRs by alice; `marks:a marks:b` — PRs with mark a OR b

### P3 - Nice to Have

- **Command palette**: "Mark PR with letter..." action
- **Clear all marks for letter**: Command palette action to clear a specific letter

## Technical Notes

### Storage Schema Change

```typescript
// OLD: markedPRs: string[]  (e.g. ["owner/repo#123", "owner/repo#456"])
// NEW: markedPRs: Record<string, string>  (e.g. { "owner/repo#123": "d", "owner/repo#456": "r" })
```

Migration on load: old `string[]` gets each entry mapped to letter `"m"`.

### Keyboard Flow

1. User presses `M` (Shift+M) — enters "mark pending" mode
2. App shows a transient message: "Mark: _" (waiting for letter)
3. User presses `a-z` — toggles that mark on the selected PR
4. Any other key cancels mark mode

For the filter shortcut:
1. User presses `'` (quote) — enters "jump to mark" mode
2. User presses `a-z` — sets filter to `marks:<letter>`
3. User presses `'` again — clears filter (if currently filtering by marks)

### Mark Mode State

Add to AppState:
```typescript
markPending: boolean  // true when waiting for mark letter
jumpPending: boolean  // true when waiting for jump letter
```

### Filter Parser

Add `marks` field to ParsedFilter:
```typescript
export interface ParsedFilter {
  // ... existing
  marks: string[]  // e.g. ["d", "r"] from "marks:d marks:r"
  marked: boolean  // keep for backward compat with >marked
}
```

Parse `marks:<letter>` tokens alongside existing prefixes.

### PR List Gutter

Show the mark letter in a 2-char column (letter + space) before the change dot:

```
d  • #421  Fix auth timeout        @alice    ✓
   • #419  Add dark mode           @bob      ○
r    #415  Refactor API client     @charlie  ✗
r    #408  Bump terraform          @dave     ✓
```

- One letter per PR, color-coded from a Catppuccin Mocha palette
- Each letter always gets the same color (fixed mapping, a=red, b=peach, etc.)

### History Schema

```typescript
export interface History {
  // ... existing
  /** Marked PRs. Key = PR key, value = mark letter */
  markedPRs: Record<string, string>
}
```

### History Operations

```typescript
/** Toggle a mark letter on a PR. Same letter removes it, different letter replaces. */
export function toggleMarkPR(history: History, prKey: string, letter: string): History

/** Check if a PR is marked (optionally with a specific letter) */
export function isPRMarked(history: History, prKey: string, letter?: string): boolean

/** Get the mark letter for a PR, or null */
export function getPRMark(history: History, prKey: string): string | null

/** Get all PRs with a specific mark letter */
export function getPRsWithMark(history: History, letter: string): string[]

/** Get all used mark letters */
export function getUsedMarkLetters(history: History): string[]
```

## File Structure

```
src/
├── history/
│   ├── schema.ts          # markedPRs type change + migration
│   └── loader.ts          # Updated mark operations
├── discovery/
│   └── parser.ts          # Add marks:<letter> predicate
├── hooks/
│   ├── useKeyboardNav.ts  # M + letter mark mode, ' + letter jump
│   └── useFiltering.ts    # Handle marks:<letter> filter
├── keybindings/
│   ├── types.ts           # (no change — mark mode handled inline)
│   └── defaults.ts        # (no change)
├── components/
│   ├── PRList.tsx          # Show mark letters in gutter
│   ├── HelpOverlay.tsx     # Update help text
│   └── DiscoverySuggestions.tsx  # Suggest marks: completions
├── commands/
│   └── definitions.ts     # Update mark command
├── types.ts               # Add markPending, jumpPending to AppState
└── state.ts               # Add mark/jump pending actions
```
