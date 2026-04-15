# Author Display Name Search

**Status**: Done

## Description

Allow searching PRs by the author's GitHub display name (e.g. "Stefan Lüdin") in addition to their login (`candril`). The login remains the canonical identifier used by `@` filters; the display name is only matched via the free-text fuzzy search.

## Out of Scope

- `@` filter matching against display name — `@stefan` should NOT match login `candril`. `@` is for logins only.
- Searching against display names of reviewers, commenters, or commit authors.
- Caching/lookup of display names for users that don't appear as a PR author.

## Capabilities

### P1

- Fetch each PR author's display name (`name`) and store it on `PR.author`.
- Free-text query tokens match against author display name in addition to title/login/repo.
- Display name is optional — gracefully handle users without a name set.

## Technical Notes

- Extend `PR.author` in `src/types.ts` to include `name?: string | null`.
- GraphQL: add `name` to the `author { ... }` selection in `PR_FRAGMENT` (`src/providers/graphql.ts`); pass it through in `transformGraphQLPR`.
- REST/`gh` CLI: `gh pr list --json author` already returns `{login, name, ...}` — `transformPR` spreads `raw` so `name` flows through automatically. Verify and document.
- `applyFilter` in `src/discovery/parser.ts`: extend the `searchable` string used for the text-search branch (around line 211) to also include `pr.author.name` when present. Leave the `@` author inclusion/exclusion logic untouched.

## File Structure

- `src/types.ts` — add `name?: string | null` to `PR.author`.
- `src/providers/graphql.ts` — fetch and pass through `author.name`.
- `src/providers/github.ts` — confirm REST path passes `name` through.
- `src/discovery/parser.ts` — include `name` in free-text search target.
