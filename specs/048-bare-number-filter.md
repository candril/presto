# Bare Number Filter

**Status**: Done

## Description

A token that is only digits (`482`) matches PRs with that number among the rows the tab
already shows. It is a filter like `@login` or `repo:name`, not a lookup: nothing is fetched
from GitHub. `#482` stays the lookup that searches every configured repo.

## Out of Scope

- Prefix or substring matching on the number (`48` does not match `482`).
- Matching digits in titles. A bare number is never free text; `v2` or `OSA-1337` still is.
- Changing `#482`, `repo#482` or URL lookups.

## Capabilities

### P1 - Must Have

- A bare digits token matches `pr.number` exactly.
- It combines with other tokens like any other kind: numbers OR with each other, AND with
  everything else (`repo:web 482`).
- No remote fetch; repo settings and `starred_only` apply as for any filter.

### P2 - Should Have

- The filtering docs page lists the token next to the `#482` lookup.

## Technical Notes

`parseFilter` collects `/^\d+$/` tokens into `ParsedFilter.numbers`; `applyFilter` drops PRs
whose number is not in it. Because `prRef` stays `null`, `useFiltering` takes the normal
path and never calls `fetchPRByNumber`.

## File Structure

- `specs/048-bare-number-filter.md` — this spec
- `src/discovery/parser.ts`, `src/discovery/parser.test.ts` — the token
- `site/src/content/docs/reference/filtering.md` — docs
