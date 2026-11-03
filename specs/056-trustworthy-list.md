# Trustworthy List

**Status**: Done

## Description

The list is only useful if what it shows can be acted on without a second look in the
browser. Today it can't be: the refresh probe cannot see a PR fall behind its base, the
header can say "just now" after a refresh that failed, the preview shows fresher data than
the row it sits next to, and an action's optimistic patch is never checked against GitHub.
This spec closes those gaps and makes the age of what is on screen visible.

## Out of Scope

- A per-row age indicator: once the gaps below are closed, every row is as old as the
  header says, give or take a single repo that failed (which the header names)
- Putting `mergeStateStatus` back into the probe (spec 052 measured why not)
- Paginating past 50 open PRs per repo
- The `r` key bypassing the auto-refresh in-flight guard
- A marker on rows whose action is not yet confirmed: the confirming fetch replaces the
  patch with GitHub's answer within seconds, so a marker would only flicker

## Capabilities

### P1 - Must Have

- **The probe sees the base move.** The digest carries the tip of each PR's base branch
  (`baseRef.target.oid`). Main moving is what turns a PR BEHIND or conflicting, and that
  field is one object, not a connection, so the probe stays at 1 point. On a busy repo
  this means most refreshes fetch in full, which is the price of a Merge column that is
  current.
- **"Unchanged" has an expiry.** A repo whose last full fetch is more than 15 minutes old
  is fetched in full even when the probe matches. This catches what no digest field moves
  for, such as a resolved review thread, within a bounded time.
- **Opening the preview refreshes the row.** When the preview for the selected PR is
  fetched, that PR is fetched again alongside it with the list's own query and replaces
  the row. The detail
  view and the list can no longer disagree, and looking at a PR is how you make sure.
  Prefetched neighbours do not trigger this.
- **Actions are confirmed.** After merge, auto-merge on/off, approve, request changes,
  ready, draft, close, reopen and update branch, the PR is fetched again after 2s and 10s.
  GitHub's answer replaces the optimistic patch, including when the action failed but the
  patch had already been applied.
- **A fetched PR updates the probe's memory too.** A refetched PR replaces its copy in the
  stored result of the last full fetch, so a later "unchanged" probe does not put the old
  row back.
- **"Still computing" is followed up.** An open, non-draft PR whose merge state comes back
  `UNKNOWN` is fetched again 5s after the refresh.

### P2 - Should Have

- **The header's age is the truth:**
  - The time is stamped once a refresh has finished, not when its first half has landed.
  - A refresh that failed outright stamps nothing.
  - Repos whose rows are being kept from an earlier fetch because their fetch failed
    are counted in the header (`! 1 repo stale`), in the warning colour.
  - On a start from the disk cache, the header shows the cache's age until the first
    refresh finishes.
  - The age re-renders every 30s, so "2m ago" cannot sit on screen for 20 minutes.
- **Progress while refreshing:** the spinner is followed by `3/5` while repos are still
  answering, when more than one repo is being fetched.
- **The palette's "Refresh PRs" is the same as `r`:** it forces a full fetch.

## Technical Notes

### Digest

`baseRef { target { oid } }` goes into both `PR_DIGEST_FRAGMENT` and `PR_FRAGMENT`, so the
digest from a full fetch matches the one from a probe. `baseRef` is null once the base
branch is deleted; the digest then carries an empty string.

### Expiry

`lastFetches` entries carry `fetchedAt`. `fetchRepoPRs` treats an entry older than
`UNCHANGED_MAX_AGE_MS` (15 min) as missing, which already means "fetch in full, no probe".

### Refetching single PRs

`getPRsGraphQL` patches every `lastFetches` entry holding one of the fetched PRs. The
patched PR keeps its place in the stored list, so the next "unchanged" answer carries it.

`usePRData` exposes `refreshPRs(prs, delayMs)`: wait, `getPRsBulk`, then `APPEND_PRS`.
`APPEND_PRS` already replaces a held PR with a copy that is at least as new, and it now
settles pending markers like `SET_PRS` does, so a confirmed branch update clears its
marker.

The command context gets `confirmPR(pr)`, which schedules the two confirming fetches.

### Header state

- `AppState.cachedAt`: the cache's `updatedAt`, or null.
- `AppState.refreshProgress`: `{ done, total }` or null.
- `AppState.staleRepos`: repos whose rows are retained from an earlier fetch.

`ListReposOptions.onRepoDone` fires once per repo whether it succeeded or failed.
`useAutoRefresh` no longer stamps the time; `fetchPRs` does, because only it knows
whether the refresh succeeded. Staleness (older than twice the interval) is computed in
the header, which owns the ticker.

## File Structure

- `src/providers/graphql.ts`: digest field, expiry, `lastFetches` patching, `onRepoDone`
- `src/providers/demo/index.ts`: `onRepoDone`
- `src/state.ts`, `src/types.ts`: `cachedAt`, `refreshProgress`, `staleRepos`, settling on `APPEND_PRS`
- `src/hooks/usePRData.ts`: stamping, progress, stale repos, `refreshPRs`, UNKNOWN follow-up
- `src/hooks/useAutoRefresh.ts`: stamping and staleness removed
- `src/hooks/usePreview.ts`: row refresh on preview load
- `src/components/Header.tsx`: ticker, cache age, stale repos, progress
- `src/commands/types.ts`, `src/commands/definitions.ts`, `src/components/CommandPalette.tsx`: `confirmPR`, forced palette refresh
- `src/App.tsx`: wiring
