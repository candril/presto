# Codebase Hardening

**Status**: Ready

## Description

A sweep of bugs, race conditions, data integrity issues, UX papercuts, and performance problems found during code review. These are concrete, file-level fixes that make presto more robust for daily use and a broader audience.

## Out of Scope

- New features (tabs, filters, etc.)
- Test coverage (separate effort)
- README/docs (separate effort)
- Config options not yet wired up (tools.default, display.compact, etc.)
- Light/auto theme support

## Capabilities

### P1 - Must Have (Bugs & Data Integrity)

#### 1. Rollback failed optimistic updates
**Files:** `src/commands/definitions.ts`

State changes (`state.ready`, `state.draft`, `state.close`, `state.reopen`) dispatch `UPDATE_PR` optimistically before the `gh` CLI call. If the API call fails, the UI shows the wrong state with no rollback. Wrap each in try/catch and dispatch the reverse update on failure.

```ts
// Before (broken)
ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { isDraft: false } })
await $`gh pr ready ${pr.number} -R ${repo}`.quiet()

// After (with rollback)
ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { isDraft: false } })
try {
  await $`gh pr ready ${pr.number} -R ${repo}`.quiet()
} catch {
  ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { isDraft: true } })
  return { type: "error", message: "Failed to mark as ready" }
}
```

#### 2. Fire-and-forget background fetch swallows errors
**Files:** `src/hooks/usePRData.ts` (lines ~186-224)

The background IIFE `(async () => { ... })()` has no `.catch()`. If the fetch throws, `SET_REFRESHING` is never cleared, leaving the UI stuck in the refreshing state (spinner never stops).

Add `.catch()` that clears the refreshing flag and shows an error message.

#### 3. Stale closure overwrites PR list on direct PR fetch
**Files:** `src/hooks/usePRData.ts` (lines ~295-343)

When fetching a single PR by reference (`#123`), the `.then()` callback dispatches `SET_PRS` with `[pr, ...prs]` where `prs` is captured from the effect's render. If a refresh completed between starting the fetch and it resolving, `prs` is stale and the dispatch overwrites the fresh data.

Fix: use `APPEND_PRS` instead of `SET_PRS` for single-PR additions.

#### 4. Stale closure race in fetchedPRs map
**Files:** `src/hooks/useFiltering.ts` (lines ~73-107)

Both `fetchMissingPRs` and `fetchPRByNumber` are async and use `fetchedPRs` from their closure. If two fetches overlap, the second creates `new Map(fetchedPRs)` from the same snapshot, and the first's `setFetchedPRs` is overwritten by the second.

Fix: use the functional form `setFetchedPRs(prev => { ... })`.

#### 5. Comment count column has identical colors for both branches
**Files:** `src/components/PRList.tsx` (line ~238)

```ts
// Bug: both branches are theme.textMuted
<span fg={pr.commentCount > 0 ? theme.textMuted : theme.textMuted}>
// Fix:
<span fg={pr.commentCount > 0 ? theme.text : theme.textMuted}>
```

#### 6. `Object.keys()` on an array for count
**Files:** `src/components/DiscoverySuggestions.tsx` (lines ~173, 262)

`Object.keys(history.recentlyViewed || {}).length` — `recentlyViewed` is an array, not an object. Works by accident but is a code smell.

Fix: `(history.recentlyViewed ?? []).length`

#### 7. `MOVE` action clamps to unfiltered list length
**Files:** `src/state.ts` (lines ~138-142)

`MOVE` uses `state.prs.length` but the UI shows `filteredPRs`. Currently `MOVE` is not dispatched from anywhere (keyboard nav uses `SELECT`), but it's in the public API. Either remove it or document it as deprecated.

### P2 - Should Have (UX & Terminal Compat)

#### 8. Focus reporting cleanup never called on exit
**Files:** `src/index.tsx` (line ~35)

`cleanupFocus` is assigned from `setupFocusReporting()` but never called. When presto exits, `DISABLE_FOCUS_REPORTING` (`\x1b[?1004l`) is never written. In terminals that support focus reporting (iTerm2, kitty, tmux), this causes garbage `\x1b[I`/`\x1b[O` sequences after exit.

Fix: call `cleanupFocus()` on renderer destroy or process exit.

#### 9. Toast dismiss-on-any-key steals keyboard input
**Files:** `src/components/NotificationToast.tsx` (lines ~52-54)

`useKeyboard(() => { onDismiss() })` fires on every key. The first keypress both dismisses the toast AND executes its normal action (e.g., `j` dismisses and moves cursor down). The user can't dismiss without side effects.

Fix: check toast visibility in `useKeyboardNav` and skip action processing, or remove keyboard dismiss and rely on auto-dismiss only.

#### 10. Notification dot shows on the active tab
**Files:** `src/components/TabBar.tsx` (lines ~56-64)

The notification dot is always shown regardless of whether the tab is active. Showing a dot on the tab the user is already looking at is redundant noise.

Fix: `const dotPrefix = (!active && tab.hasNotification) ? "• " : "  "`

#### 11. Guard against undefined tab on close
**Files:** `src/hooks/useKeyboardNav.ts` (lines ~108-116)

If `activeTabId` doesn't match any tab (edge case), `currentTab` is undefined and the message becomes `Closed "undefined"`.

Fix: add `if (!currentTab) return` guard.

### P3 - Nice to Have (Performance & Hardening)

#### 12. Unbounded preview cache growth
**Files:** `src/state.ts` (SET_PREVIEW_CACHE case)

Preview cache grows without limit. Each `PRPreview` is several KB (files, commits, comments, body). With prefetching of 4 adjacent PRs per selection, browsing 100+ PRs accumulates hundreds of entries. Only cleared on refresh.

Fix: implement LRU eviction, cap at ~30 entries.

#### 13. Synchronous I/O on every filter keystroke
**Files:** `src/cache/loader.ts` (`saveFilterQuery`)

Every keystroke in the filter bar triggers `readFileSync` + `writeFileSync`. Blocks the event loop and can cause jank on slow filesystems.

Fix: debounce like `debouncedSaveHistory` and `debouncedSaveTabs`.

#### 14. Prefetch loop is sequential and not cancellable
**Files:** `src/hooks/usePreview.ts` (lines ~148-176)

Prefetch iterates 4 PRs with sequential `await`. If user moves selection, `clearTimeout` prevents starting but doesn't cancel in-flight fetches. Stale cache updates are dispatched for PRs the user has moved away from.

Fix: use an epoch counter to bail out of the loop if selection changed.

#### 15. SIGCONT handler churn from unstable callback references
**Files:** `src/hooks/useAutoRefresh.ts` (lines ~103-120)

`doRefresh` changes on every render because `onRefresh` creates a new closure. This causes rapid attach/detach of `SIGCONT` handlers.

Fix: use a ref for `doRefresh` so the effect only depends on `onFocus`.

#### 16. GraphQL injection via repo names
**Files:** `src/providers/graphql.ts` (lines ~128-135, 218-226)

Repo owner/name from config are interpolated directly into GraphQL query strings. Malformed config values could break queries or cause unexpected behavior.

Fix: use GraphQL variables (`$owner`, `$name`) via the `variables` field in the POST body, or validate with `/^[a-zA-Z0-9._-]+$/`.

#### 17. `fetchPRPreview` has no error handling
**Files:** `src/providers/github.ts` (lines ~371-407)

Unlike every other provider function, `fetchPRPreview` has no try/catch. If `gh pr view` fails, `log.finish()` is never called (open request in logger) and the error message to the user is generic.

Fix: add try/catch with `log.fail(error)` like the other provider functions.

#### 18. `listMyPRs` and `listReviewRequests` don't catch errors
**Files:** `src/providers/github.ts` (lines ~159-177)

Every other `list*` function has try/catch and returns `[]` on failure. These two will throw unhandled.

Fix: add try/catch like the other functions.

#### 19. `availableCommands` useMemo has incomplete dependencies
**Files:** `src/components/CommandPalette.tsx` (lines ~87-90)

Dependency array only includes `context.selectedPR` and `context.columnVisibility`, but `getAvailableCommands` also checks `context.history`, `context.tabs.length`, and `context.config`.

Fix: add missing dependencies.

#### 20. Stale `history` closure in `fetchPRs`
**Files:** `src/hooks/usePRData.ts` (lines ~150-275)

`fetchPRs` uses `history` from closure but it's not in the dependency array. Marked PRs added since `fetchPRs` was created won't be fetched.

Fix: use `historyRef.current` pattern.

#### 21. Duplicate `prHasUnread` reimplements `prHasChanges`
**Files:** `src/hooks/useTabNotifications.ts` (line ~34-37)

Local `prHasUnread` does the same thing as `prHasChanges` from `notifications/snapshots.ts`. Maintenance hazard.

Fix: import and use `prHasChanges` instead.

## File Structure

Changes span across many files but no new files needed:

```
src/
├── commands/definitions.ts       # P1: rollback optimistic updates
├── hooks/usePRData.ts            # P1: catch background errors, fix stale closure
├── hooks/useFiltering.ts         # P1: functional setState for fetchedPRs
├── hooks/useKeyboardNav.ts       # P2: guard undefined tab
├── hooks/usePreview.ts           # P3: epoch-based prefetch cancellation
├── hooks/useAutoRefresh.ts       # P3: ref-based SIGCONT handler
├── hooks/useTabNotifications.ts  # P3: use shared prHasChanges
├── components/PRList.tsx         # P1: fix comment count color
├── components/DiscoverySuggestions.tsx  # P1: fix Object.keys on array
├── components/NotificationToast.tsx     # P2: fix key stealing
├── components/TabBar.tsx         # P2: hide dot on active tab
├── components/CommandPalette.tsx  # P3: fix useMemo deps
├── providers/github.ts           # P3: add error handling
├── providers/graphql.ts          # P3: use GraphQL variables
├── state.ts                      # P1: remove/deprecate MOVE; P3: LRU cache
├── cache/loader.ts               # P3: debounce filter save
└── index.tsx                     # P2: call cleanupFocus on exit
```
