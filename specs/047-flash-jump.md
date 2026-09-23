# Flash Jump

**Status**: Done

## Description

`s` labels every PR row on screen and the next keystroke lands the cursor on the row it
names — the flash.nvim-style jump riff and lane already have, with the same key. Getting
to the eleventh row stops being eleven `j`s.

## Out of Scope

- Labelling rows off screen. The jump is for what you can point at; `/` is for what you
  have to describe.
- A search-then-label mode like riff's diff flash. A PR list is rarely longer than a
  screen, and every row gets a label straight away.
- Acting on the row. The jump moves the cursor; `enter`, `o` and the rest do the rest.

## Capabilities

### P1 - Must Have

- `s` (`nav.jump`, rebindable) labels the visible rows, top to bottom, and waits.
  Typing a label moves the cursor there; `escape` or any key that is not the start of a
  label cancels.
- **Nothing moves.** A label is drawn over the separator cell right before the title —
  against the text it names, not out in a gutter — so no column shifts and the list does
  not scroll when it appears. Landing on a row
  inside the scroll margin does not scroll either: the row was on screen, and the jump
  must leave it where the eye found it.
- **The title stays readable.** The label ends where the title begins and never covers
  any of it.
- `s` no longer stars the author; starring moves to `S`.

### P2 - Should Have

- Labels are single keys for up to 25 rows; beyond that every label is two keys, so none
  is a prefix of another. A two-key label takes the time column's last cell as well, which
  a four-character age ("11mo") gives up while the labels are up.
- While the labels are up, each row's prose dims, so the labels are what the eye finds.
- The help overlay and docs list `s` and the move of star to `S`.

## Technical Notes

`src/flash.ts` holds the pure half, taken from lane's `utils/jump.ts`: `flashLabels(count)`
over lane's alphabet (home row first, `s` left out since it starts the jump), and
`resolveFlashKey()` deciding whether a key jumps, narrows a two-key label, or cancels.

`useFlash` holds the active labels, keyed by PR URL rather than index so a refresh
landing mid-jump cannot send the cursor to whatever PR took that slot.

The visible range comes from the list's scrollbox: `PRList` fills a handle with
`visibleRows()` (from `scrollTop` and the viewport height) and `holdScroll()`, which
makes the scroll-margin effect skip the next selection change. It is set only when the
cursor actually moves; a jump onto the current row would otherwise leave it armed and
swallow the next `j`'s scroll.

## File Structure

- `specs/047-flash-jump.md` — this spec
- `src/flash.ts`, `src/flash.test.ts` — labels and key resolution
- `src/hooks/useFlash.ts` — jump state
- `src/components/PRList.tsx`, `src/components/PRList.test.ts` — view handle, label drawn
  over the cells before the title, dimming
- `src/hooks/useKeyboardNav.ts` — `s` starts, active jump owns the keyboard
- `src/App.tsx` — wiring
- `src/keybindings/types.ts`, `src/keybindings/defaults.ts` — `nav.jump` → `s`, star → `S`
- `src/commands/definitions.ts`, `src/components/HelpOverlay.tsx` — shortcut text
- `site/src/content/docs/reference/{key-bindings,configuration,marks-unread,filtering}.md`
