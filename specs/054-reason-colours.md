# Reason Colours

**Status**: Done

## Description

The merge reason at the end of a row's title (spec 053) is one muted grey, so a row that
needs you reads the same as one that needs nobody. Now that the reason costs only the rows
that carry one, it gets a colour, and the colour answers the question the list is for:
*what does this PR need, and is that you?* Whose PR it is and whether you approved it
decide which rows speak at all.

## Out of Scope

- **Review requested of you specifically.** It needs `reviewRequests` on every fetch and
  team membership to resolve team requests. An open review on a PR that is not yours is
  already a review you could give.
- The glyph's colour: it stays the verdict's, the same for every viewer.
- The preview's Merge status section.

## Capabilities

### P1 - Must Have

One colour per meaning, viewer-aware. `you` is the logged-in `gh` user; with none, every
row reads as someone else's PR that you have not approved.

| Tone | Colour | Meaning | Reasons |
| --- | --- | --- | --- |
| clear | green | nothing more needed from you | `ready` (your PR, mergeable) · `approved` (you approved it and it waits on nothing but other people) · `#1 ~3m` once mergeable in the queue |
| author | amber | the author has to act | `conflicts`, `behind`, `changes`, `2 failing`, `3 threads`, `stalled`, `queue err` |
| review | blue | a review is open and could be yours | `review` (not your PR, not approved by you) |
| quiet | muted | nobody's to give, or not yours | `CI 5/8`, `CI queued`, `computing`, `blocked`, `updating`, `#1 ~3m` while waiting |

- Your own PR awaiting review shows no word: the `?` glyph says so, and there is nothing
  for you to do.
- Someone else's PR that is ready shows no word unless you approved it: merging it is
  their call.
- The reason is not faded with the row's age: it is status, like the glyphs.

### P2 - Should Have

- The `?` legend lists the four colours.

## Technical Notes

`getMergeReason(pr, pending, viewer)` in `src/status.ts` takes the verdict detail and
overlays the viewer. Logins compare case-insensitively: GitHub treats them so.

Precedence follows the verdict: open threads, conflicts and the other author's-move reasons
win over an approval, so a PR you approved that grew a conflict turns amber, not green.

## File Structure

- `src/status.ts` — `getMergeReason`, tone colours
- `src/components/PRList.tsx` — renders the reason in its tone; takes `currentUser`
- `src/App.tsx` — passes `currentUser`
- `src/components/HelpOverlay.tsx` — legend
- `src/mergeStatus.test.ts` — tests
- `site/src/content/docs/reference/status-columns.md`, `CHANGELOG.md`
