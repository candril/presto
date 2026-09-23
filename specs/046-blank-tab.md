# Blank Tab

**Status**: Done

## Description

`n` opens a new tab with no filter — every PR from the enabled repos, cursor at the top —
and switches to it. `t` stays what it is: a copy of the current tab. Starting a view from
nothing should not mean duplicating one and then clearing its filter.

## Out of Scope

- Changing `t`. Copying a tab is how a variation of a filter gets made.
- Opening the filter bar on the new tab. A blank tab is a view in its own right, and `/`
  is one key away.
- A "default filter" setting for new tabs. Blank means blank.

## Capabilities

### P1 - Must Have

- `n` (`tab.blank`, rebindable) adds a tab with an empty filter after the last one and
  makes it active.
- The tab being left keeps its cursor position, as on any tab switch.
- The help overlay lists `n` under Tabs, next to `t`.

### P2 - Should Have

- A "New Blank Tab" entry in the command palette.
- The docs site's key-binding, tabs and configuration pages list it.

## Technical Notes

A `NEW_TAB` reducer action appends `createDefaultTab()` and sets `discoveryQuery` to `""`
and `selectedIndex` to `0`, saving the current tab's selection first the way `SWITCH_TAB`
does. The title comes from `generateTabTitle("")` at render time like any other tab's.

No fetch is involved: every tab reads the one shared PR list, and an empty filter shows
the enabled repos, which a refresh always loads.

## File Structure

- `specs/046-blank-tab.md` — this spec
- `src/state.ts`, `src/state.test.ts` — `NEW_TAB`
- `src/keybindings/types.ts`, `src/keybindings/defaults.ts` — `tab.blank` → `n`
- `src/hooks/useKeyboardNav.ts` — the binding
- `src/commands/definitions.ts` — palette entry
- `src/components/HelpOverlay.tsx` — help row
- `site/src/content/docs/reference/{key-bindings,tabs,configuration}.md` — docs
