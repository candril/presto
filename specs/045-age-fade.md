# Age Fade

**Status**: Done

## Description

A row's text dims as the time since its last update grows: normal until three weeks,
half-faded to six, then a floor it never drops below. The list keeps its whole contents
while saying, without a column or a glyph, which rows have gone quiet.

## Out of Scope

- Hiding or sorting by age. The fade is a reading aid, not a filter; `>stale` and friends
  are a separate question.
- Fading on anything but the last update. Age by creation date, or by the last commit
  pushed, are different statements and would disagree with the time column.
- Exempting rows. Marked, unread and starred rows fade with everything else — the fade
  answers one question only, and a row that opts out of it makes the signal unreadable.

## Capabilities

### P1 - Must Have

- A row untouched for `fade_after_days` renders its prose — title, PR number, age,
  comment count, author, repo — blended towards the background; at twice that age it
  sits on `fade_floor`.
- The status glyphs (state, checks, review, sync, merge) and the mark letter keep their
  colour at every age. An old PR with a failing check is usually the one worth seeing.
- The row under the cursor is never faded: it is the one being read.
- `fade_after_days = 0` turns the fade off completely.
- A PR with no readable `updatedAt`, or one dated in the future, is not treated as old.

## Technical Notes

`src/fade.ts` holds both halves: `fadeLevel()` turns a timestamp into how much colour
survives, and `fade()` blends a hex colour towards the background by that much. Terminals
have no alpha over text, so a blend is what "less opaque" can mean; the steps are discrete
because a continuous ramp makes every row a slightly different colour and none of them
readable as a value.

The fade keys off `updatedAt` — the same field the time column renders, so a row reading
"2d" never looks ancient. `PRRow` computes one level and wraps each prose span's colour in
it; the glyph spans are left alone.

## File Structure

- `src/fade.ts`, `src/fade.test.ts` — the level and the blend
- `src/config/schema.ts`, `src/config/loader.ts` — `display.fade_after_days`, `display.fade_floor`
- `src/components/PRList.tsx` — per-row level, applied to the prose spans
- `src/App.tsx` — passes the settings in
