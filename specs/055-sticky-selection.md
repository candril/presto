# Sticky Selection

**Status**: Done

## Description

The selection is an index into the filtered list, and every refresh re-sorts that list by
last update. A PR that moved up pushed a different one under the cursor, so `y` copied, and
`Enter` opened, a PR the user never picked. The selection now follows its PR's URL when the
list reorders under it.

## Out of Scope

- A selected PR that leaves the list (merged, closed, filtered out by the refresh): the
  cursor keeps its row index, as before
- Persisting the selected URL across restarts or tab switches: tabs still remember an index

## Capabilities

### P1 - Must Have

- When the filtered list changes while the tab, the query and the cursor index stay put, and
  the PR under the cursor is no longer the one that was there, the cursor moves to that PR's
  new row.
- A query change or a tab switch is not followed: those keep resetting or restoring the index.
- The move happens before the frame is painted, so the wrong row is never drawn as selected.

## Technical Notes

- `relocateSelection(anchor, prs, selectedIndex, context)` is pure: it returns the index to
  select, or null when nothing has to move. The anchor is the URL and index seen on the last
  render plus a context key (`tabId` + query).
- `useStickySelection` keeps the anchor in a ref and dispatches `SELECT` from a
  `useLayoutEffect`.
- Keyed on the URL, not `repo#number`: the URL is what every reducer merges PRs by.

## File Structure

- `src/hooks/useStickySelection.ts` - the hook and `relocateSelection`
- `src/hooks/useStickySelection.test.ts` - tests for `relocateSelection`
- `src/App.tsx` - wires the hook to the filtered list
