# Move Tabs

**Status**: Done

## Description

Tabs stay in the order they were opened, so a tab opened late sits at the end and its
number key is out of reach. `{` and `}` move the active tab one position left or right,
next to `[` and `]`, which switch to the previous or next tab.

## Out of Scope

- Dragging tabs with the mouse
- Moving a tab to an arbitrary position in one step
- Wrapping around: moving the first tab left does not put it at the end

## Capabilities

### P1 - Must Have

- `{` (`tab.moveLeft`) moves the active tab one position left, `}` (`tab.moveRight`) one
  right. Both can be rebound under `keys` like any other action.
- The moved tab stays active and the tab bar highlights it at its new position.
- At the first or last position, and with a single tab, the key does nothing.
- The new order is persisted with the tabs, and `1`-`9` follow it.

### P2 - Should Have

- Palette commands "Move Tab Left" / "Move Tab Right", offered only when there is more
  than one tab.
- The help overlay lists `{ / }` under Tabs.

## Technical Notes

`MOVE_TAB { delta: -1 | 1 }` in the reducer swaps the active tab with its neighbour and
returns the same state object at the ends, so nothing re-renders or gets saved. The
existing `useEffect` on `state.tabs` in `App.tsx` already persists the new order through
`debouncedSaveTabs`.

`{` and `}` arrive as `key.name === "{"` / `"}"` without `shift`, the same as `?`: legacy
input sends the character, and with OpenTUI's default kitty flags (disambiguate +
alternate keys) a shifted key that produces text is still sent as text.

## File Structure

- `src/state.ts` - `MOVE_TAB` action
- `src/state.test.ts` - reducer tests
- `src/keybindings/types.ts`, `src/keybindings/defaults.ts` - `tab.moveLeft` / `tab.moveRight`
- `src/hooks/useKeyboardNav.ts` - key handling
- `src/commands/definitions.ts` - palette commands
- `src/components/HelpOverlay.tsx` - help rows
