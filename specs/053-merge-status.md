# Merge Status

**Status**: Done

## Description

The list's merge verdict is one glyph: it says whose move a PR is, not what is holding it
up, so `!` could be red CI, a conflict, a stale base or open threads, and the preview is
the only place to find out. The Merge column now names the blocker in a word or two, and
the preview replaces its five letter rows with a "Merge status" section modelled on
riff's (riff spec 108): one line per gate GitHub applies, with the detail where something
is not fine. It also covers the merge queue, which spec 040 described and nothing showed.

## Out of Scope

- **Required approval counts** (`1/2 approvals`). They come from branch protection and
  rulesets; classic protection answers null to anyone who cannot administer the repo, so
  the number would be missing or wrong for most readers.
- **Queue length** (`#1 of 3`). It is a query on the base branch's queue, per repo; the
  position alone answers "when does it land".
- **Required vs optional checks.** `gh pr view` does not say which checks are required,
  so failing checks are listed failing-first, not required-first.
- **Folding.** The preview has no fold keys; the checks list shows only when something
  is not green, and is capped.
- **Adding to or removing from the queue**: `gh pr merge --auto` already queues (spec 040).

## Capabilities

### P1 - Must Have

#### Merge column in words

- The Merge column is the verdict glyph followed by its short reason, coloured like the
  glyph: `✓ ready`, `✗ 2 failing`, `! 3 threads`, `! conflicts`, `! behind main`,
  `! changes req.`, `? review`, `· CI 5/8`, `· computing`, `⧗ queue #1 ~3m`,
  `⇢ auto squash`. A draft stays blank: the state column already says draft.
- The short reason comes from the same rule as the verdict (`computeMergeVerdictDetail`
  returns both), so the column and the preview can never disagree.
- Layout gives way in order: first the C/R/B gate glyphs go (as today, spec 036), then
  the Merge column falls back to the glyph alone, so the title keeps its minimum width.

#### Merge queue (spec 040)

- `mergeQueue` on `PR`: position, state, estimated time to merge, when and by whom it
  was added. From `mergeQueueEntry` on the GraphQL path; null on the `gh` fallback,
  which exposes no queue field.
- A queued PR gets its own verdict, `queued`, glyph `⧗`: blue while it waits, green once
  GitHub calls it mergeable in the queue. `UNMERGEABLE` is the author's move:
  `! queue: unmergeable`.
- It outranks auto-merge: an armed PR that has reached the queue is in line, and saying
  so is the more precise answer.

#### Check counts

- `checkCounts` on `PR`: total, passed, failed, running. From the rollup's
  `checkRunCountsByState` / `statusContextCountsByState` aggregates on the GraphQL path
  (no per-check nodes, no extra rate-limit cost), counted from the check list on the `gh`
  and demo paths.
- Passed: success, neutral, skipped. Failed: failure, timed out, cancelled, startup
  failure, action required, error. Running: everything not yet concluded.

#### Preview "Merge status" section

Replaces the S/C/R/B/M rows:

```
Merge status  ⧗ Queued #1 · awaiting checks · ~3m

✓ Checks         8/8 passed
✓ Reviews        1 approval
✓ Conversations  all resolved
○ Conflicts      checking
⚠ Base           1 commit behind master
⧗ Queue          #1 · awaiting checks · ~3m · added by candril 2m ago
○ Blockers       GitHub is still computing the merge state
```

- Header: the verdict glyph and its full reason, as the old M row said it.
- Line icons: `✓` ok, `⚠` warning, `✗` failing, `○` pending, `ℹ` information, `⧗` queue.
- **Checks**: `N/M passed`, `N/M · a, b failing +K`, `N/M · K running`, or `no checks`.
  Failing and running checks are listed under the line, failing first, at most 8, then
  `+N more`. All green: no list.
- **Reviews**: `N approval(s)` (or `no approvals`), then ` · changes requested by a, b`
  and ` · waiting on x, y`. Fails on changes requested; pending on review required.
- **Conversations**: `all resolved` or `N unresolved` — a warning, failing when GitHub
  reports the PR blocked.
- **Conflicts**: `no conflicts`, failing `conflicting`, pending `checking`.
- **Base**: `up to date with <base>` or `N commit(s) behind <base>` — failing when being
  behind blocks the merge, a warning otherwise. Without the count: `behind <base>` or
  `could not compare with <base>`.
- **Queue**: only while queued. `#N · <state> · ~ETA · added by <login> <age>`, failing
  when unmergeable.
- **Blockers**: `draft`, `blocked by branch protection` (blocked with nothing above
  explaining it), pending `GitHub is still computing the merge state`, information
  `auto-merge armed (<method>)`; else `none`.
- Merged and closed PRs show their state instead of the section.

### P2 - Should Have

- The probe digest (spec 052) carries the queue position and state and the check
  counts, so a refresh notices a PR moving up the queue or another check finishing.
- The behind count: one REST compare (`base...head`) when the preview is fetched.

### P3 - Nice to Have

- Queue length (`#1 of 3`), required approval counts — see Out of Scope.

## Technical Notes

Measured on Dg.GalaxusAbos (50 open PRs): `mergeQueueEntry` and the rollup's count
aggregates each cost 0 extra rate-limit points and stay within timing noise.

`checkCounts` is null on cached PRs written before it existed; `getCheckCounts` then
counts the stored rollup, which on the GraphQL path is a single synthetic entry. That
reads `1/1` for the seconds until the first refresh replaces it.

## File Structure

- `src/types.ts` — `checkCounts`, `mergeQueue`, the `queued` verdict, short reasons
- `src/status.ts` — merge label for the list
- `src/mergeStatus.ts` — the preview section's model (pure, tested)
- `src/components/PRList.tsx` — Merge column in words, layout fallback
- `src/components/PreviewPanel.tsx` — the section
- `src/providers/graphql.ts`, `src/providers/github.ts` — fields, digest, behind count
- `src/providers/demo/*` — a queued fixture, counts, behind count
