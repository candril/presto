# Merge queue state

**Status**: Ready

## Description

Show when a PR sits in a merge queue. GitHub's merge queue (live on Dg.GalaxusAbos
`master`) is a state the status columns currently cannot express: a queued PR reads as
`⇢ auto-merge armed` or `? blocked by branch protection` when the truth is "it is in
line and will land on its own". Observed on Dg.GalaxusAbos#1153 — queued, next up,
merged 2h later — while presto had nothing to say about it.

## Out of Scope

- Adding a PR *to* the queue as a separate command — `gh pr merge --auto` already does
  the right thing on queue branches ("If required checks have passed, the pull request
  will be added to the merge queue"), so the existing auto-merge command covers it. At
  most the dialog copy could say "merge when ready" on queue repos; not worth a branch
  in the dialog until someone is confused by it.
- Queue-position notifications ("your PR is next") — see P3.
- Rendering the queue itself (who else is in line). The PR row answers "where is *this*
  PR"; the queue view is a different surface.
- The `gh` REST fallback: `gh pr list --json` exposes no merge-queue field at all
  (checked against the full field list), so on that path a queued PR keeps today's
  rendering. Acceptable degradation, same as review threads (spec 037).

## Capabilities

### P1 - Must Have

#### `mergeQueueEntry` on `PR`

```ts
/** Present iff the PR sits in a merge queue */
mergeQueueEntry: {
  state: "QUEUED" | "AWAITING_CHECKS" | "MERGEABLE" | "UNMERGEABLE" | "LOCKED"
  position: number
  /** Seconds until GitHub expects it to merge, when it can estimate */
  estimatedTimeToMerge: number | null
} | null
```

Fetched by the GraphQL bulk path only:

```graphql
mergeQueueEntry { state position estimatedTimeToMerge }
```

`isInMergeQueue` is not fetched — it is exactly `mergeQueueEntry != null`.
`normalizePR` defaults the field to `null`, which also covers cached PRs from before
the field existed and everything from the REST path.

#### `queued` merge verdict

| verdict | icon | colour | meaning |
|---|---|---|---|
| `queued` | `»` | secondary | in the merge queue; it will land by itself |

Slots into the precedence table from [037](037-merge-verdict-consolidation.md) directly
after `draft` (a draft cannot be queued, so the order between those two is moot) and
**above** auto-merge and open threads:

| # | test | verdict |
|---|---|---|
| 1 | an action the user fired is in flight | `pending-action` |
| 2 | `isDraft` | `draft` |
| **2.5** | **`mergeQueueEntry` set, entry not `UNMERGEABLE`** | **`queued`** |
| **2.6** | **`mergeQueueEntry.state === "UNMERGEABLE"`** | **`author`** |
| 3 | auto-merge armed | `auto-merge` |
| … | *(unchanged)* | |

- **Queued outranks open threads and auto-merge.** Once enqueued, the review gates are
  passed and commits made after the enqueue event will not be merged (GitHub says so on
  the timeline) — nothing a human does to the PR changes what lands. Whether
  `autoMergeRequest` stays set while queued is not observable right now (see
  verification note); the precedence makes the answer irrelevant.
- **`UNMERGEABLE` is the author's move**, reason `merge queue cannot merge it — will be
  ejected`. The queue tried this PR and failed; it is about to be kicked out and someone
  has to fix and re-queue it. Every other entry state (`QUEUED`, `AWAITING_CHECKS`,
  `MERGEABLE`, `LOCKED`) is the queue doing its job.
- Same glyph in compact (`S M`) and expanded (`S C R B M`) modes — the verdict column is
  always visible, so queue state never hides behind the gate toggle.

#### Preview header M row (spec 039)

The reason names the entry's sub-state, position, and ETA when GitHub provides one:

| entry state | reason |
|---|---|
| any, position 1 | `In merge queue — next up` |
| any, position > 1 | `In merge queue — position N` |
| `AWAITING_CHECKS` | append `, queue checks running` |
| `LOCKED` | append `, queue locked` |
| `estimatedTimeToMerge` set | append ` · ~N min` (`< 1 min` under 60s) |

Example: `M » In merge queue — position 2, queue checks running · ~8 min`.

Whether `position` is 0- or 1-based is not documented and the queue is empty right now;
verify against the first live queued PR (GitHub's own banner for #1153 said "next up")
and fix the mapping if it is 0-based.

#### Legend

- Help-overlay legend gains the `»` row in the M section, colour secondary.

### P2 - Should Have

- **Remove from merge queue** command, available when `mergeQueueEntry` is set. There
  is no `gh pr` flag for this; it is the `dequeuePullRequest` GraphQL mutation, which
  needs the PR node id — fetched on demand (`gh pr view <n> -R <repo> --json id`), same
  pattern as other single-PR actions. Optimistic update: `mergeQueueEntry: null`.
  Lives in `src/actions/queue.ts`, returning `{ success, message }` like the others.
- **"Disable auto-merge" stays inert on a queued PR** — if `autoMergeRequest` turns out
  to be null while queued the availability check already hides it; if it stays set,
  hide the command when `mergeQueueEntry` is set so the palette offers the dequeue
  command instead of a no-op.

### P3 - Nice to Have

- Notification when a tracked PR is ejected from the queue (`PRSnapshot` gains the
  entry state; `UNMERGEABLE`/disappeared-without-merge → "ejected from merge queue").
  Entering the queue is usually the user's own action, so only the ejection is news.
- Queue ETA in the list row's time column while queued.

## Technical Notes

### What GitHub exposes

`PullRequest.mergeQueueEntry` (GraphQL only):
`state`, `position`, `enqueuedAt`, `estimatedTimeToMerge`, `solo`, `jump`, `enqueuer`,
`baseCommit`, `headCommit`. Only the first three matter here; `solo`/`jump` are
deployment-train niceties this org does not use.

Entry states (introspected): `QUEUED` (in line), `AWAITING_CHECKS` (queue-run checks
in flight), `MERGEABLE` (ready to land), `UNMERGEABLE` (will be ejected), `LOCKED`.

`repository.mergeQueue(branch:)` also exists (entries list, totalCount) — not fetched;
per-PR entry data is enough for the row and header.

### Which repos have queues

Checked live: of the five configured repos only **Dg.GalaxusAbos** has a merge queue
(on `master`); the rest return `mergeQueue: null`. The per-PR field costs nothing on
repos without a queue, so the fragment addition is unconditional.

### Open verification (queue was empty while designing)

To confirm on the next live queued PR, in one query:
`mergeStateStatus` while queued (docs suggest it stays `BLOCKED`), whether
`autoMergeRequest` survives enqueueing, and the `position` base. None of these change
the design — precedence 2.5 sits above every field in doubt — but the position base
decides the "next up" mapping, and #1090/#1142-style quirks in this repo have earned
the paranoia.

## Regression tests

`src/types.test.ts`: fixtures pinning
- queued + open threads + auto-merge armed → `queued` (precedence over both),
- `UNMERGEABLE` → `author`,
- draft precedence unchanged,
- reason strings for position/ETA composition in `status.ts` rows.

## File Structure

```
src/
├── types.ts                      # MergeQueueEntryState, PR.mergeQueueEntry, verdict routing
├── status.ts                     # ICONS.mergeQueued "»", indicator, M-row reason text
├── providers/graphql.ts          # fragment field + transform
├── actions/queue.ts              # NEW (P2): dequeuePullRequest mutation
├── commands/definitions.ts       # P2: remove-from-queue command, disable-auto guard
└── components/HelpOverlay.tsx    # legend row

specs/
└── 040-merge-queue-state.md      # this file
```
