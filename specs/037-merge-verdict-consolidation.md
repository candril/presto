# Merge verdict consolidation

**Status**: In Progress

## Description

Collapse the five status columns to a single merge-verdict column by default, and put the
gate detail behind a keybinding. Replaces the verdict vocabulary from
[036](036-merge-status-overhaul.md): instead of restating GitHub's merge state, the column
answers **whose move is it**.

## Out of Scope

- Splitting "waiting on others" into "waiting on *you*" — needs review-request data
  matched against the current user. The single biggest follow-up (see below).
- Removing the per-column toggles for checks / review / base
- Changing what the C, R and B columns show when expanded

## Why not blocked / pending / ready

Measured over every open PR in the configured repos:

| bucket | count | share |
|---|---|---|
| blocked | 19 | 86% |
| ready | 2 | 9% |
| pending | 1 | 5% |

86% in one bucket makes the column a constant — strictly worse than the five gates it
replaces. "Blocked" fails because it merges *needs a review* with *has conflicts* and
*is behind*: different people, different next steps.

Re-cutting the same PRs by whose move it is (74 PRs, all four repos, after the routing
fixes above):

| verdict | count | share |
|---|---|---|
| author | 42 | 57% |
| others | 23 | 31% |
| ready | 5 | 7% |
| machine | 2 | 3% |
| auto-merge | 2 | 3% |

`author` is the largest bucket but is genuinely composed rather than a catch-all: 25
drafts, 12 failing builds, 3 conflicting, 2 behind. Drafts are 34% of all open PRs in
these repos, and the state column always distinguishes them (`◌ !`).

## Capabilities

### P1 - Must Have

#### Verdict vocabulary

| verdict | icon | colour | meaning |
|---|---|---|---|
| `ready` | `✓` | success | mergeable now |
| `author` | `!` | warning | behind · conflicts · draft · changes requested |
| `others` | `?` | primary | waiting on someone else, usually a review |
| `machine` | `·` | muted | CI running · GitHub still computing |
| `draft` | `-` | muted | not up for merge; the state column says the rest |
| `auto-merge` | `⇢` | secondary | armed; it will land by itself |
| `pending-action` | `↻` | warning | the user's branch update has not landed yet |

Precedence, highest first:

| # | test | verdict |
|---|---|---|
| 1 | an action the user fired is in flight | `pending-action` |
| 2 | `isDraft` | `draft` |
| 3 | auto-merge armed | `auto-merge` |
| 4 | unresolved review threads (non-bot) | `author` |
| 5 | `CLEAN` / `HAS_HOOKS` / `UNSTABLE` | `ready` |
| 6 | `DIRTY` · `BEHIND` · `CHANGES_REQUESTED` · checks `FAILURE` · checks stalled | `author` |
| 7 | `REVIEW_REQUIRED` | `others` |
| 8 | checks `PENDING` / `NONE`, or `UNKNOWN` | `machine` |
| 9 | anything else | `others` |

Reasoning behind the non-obvious rows:

- **2 — a draft has no verdict at all**, shown as a muted `-`. It is not up for merge, the
  state column already says so, and drafts are **52% of open PRs** across these repos —
  65 of 124, of which 57 have nobody requested and nobody looking, median age 127 days.
  Giving them any verdict drowns the column in PRs that are not in play.

  Nothing GitHub reports about a draft is trustworthy enough to build a verdict on either,
  because branch protection is not evaluated for drafts. The two drafts reported as wrong
  prove it from both directions: `Dg.GalaxusAbos#1106` answered `CLEAN` with a null review
  decision while its base requires an approval it does not have, and `isomorph#10187`
  answered `BLOCKED` with a `REVIEW_REQUIRED` that no one had actually requested (0
  reviewers, 0 reviews). `REVIEW_REQUIRED` on a draft is branch protection's default
  answer, not a real request — it holds for 60 of the 65 drafts.
- **4 — a comment blocks the PR.** This team rarely uses "request changes"; a reviewer
  leaves a plain comment and expects the author to act. GitHub models that as a
  `COMMENTED` review, which leaves `reviewDecision` at `REVIEW_REQUIRED` — so
  `Dg.GalaxusAbos#1115` read as "waiting for review" when its reviewer was in fact waiting
  on the author. An open thread is therefore the author's move, and only once every thread
  is resolved does an unapproved PR go back to awaiting review. Observed live on #1115:
  unresolved → `!`, and the moment the thread was resolved → `?`.

  Placed above `ready` deliberately: the convention is social, not enforced, so GitHub will
  happily report `CLEAN` on a PR whose reviewer is still waiting.

  **Bot threads do not count.** Copilot's auto-review opens threads exactly like a person
  — 22% of all open threads across these repos — but a machine suggestion is not the team
  blocking the PR, and presto already discounts bots elsewhere (spec 024). GraphQL's
  `author.__typename == "Bot"` settles it where the name patterns cannot:
  `isBot("copilot-pull-request-reviewer")` is `false`. Verified: `isomorph#7562` (13
  Copilot threads) counts 0, `isomorph#7533` (16 human threads) counts 16.

  Threads are fetched `first: 20`; a PR with more than 20 threads whose first 20 are all
  resolved would be missed. The `gh` fallback exposes no review threads at all, so the
  rule simply does not apply on that path.

- **5 — `UNSTABLE` is mergeable.** Only a non-required check is red and GitHub offers the
  merge; the checks column carries the warning.
- **6 — a red build is the author's move.** It previously fell through to `others`, which
  reads as "needs a review" on a PR whose actual problem is a broken build (12 PRs).
- **7 before 8 — an outstanding review outranks running CI.** The review is the bottleneck
  a human can clear now; CI finishes on its own either way. This makes `machine` mean
  something precise: *no human action is outstanding*.
- **8 — checks `NONE` is a machine wait, not a residual.** A blocked PR with no checks
  reported is waiting for required checks to appear. `Dg.GalaxusAbos#1114` — approved,
  mergeable, `BLOCKED`, zero checks — was showing "waiting on others" on an
  already-approved PR.
- **Queued suites are pending, not absent.** `statusCheckRollup` counts only *started*
  runs, so a commit whose check suites are all still `QUEUED` reports `NONE` — rendering
  `-` in the checks column, which reads as "this repo has no CI" when the truth is "CI has
  not picked it up". `checkSuites(first: 20)` supplies the missing state and
  `getPRCheckState` promotes it to `PENDING` (`*`).

  The flag is computed only when the rollup is empty: these repos park suites (renovate,
  terraform) in `QUEUED` indefinitely, so a queued suite on its own proves nothing. With
  the guard, 7 of 74 open PRs are genuinely queued-but-not-started and none render `-`.
  The `gh` fallback exposes no check suites, so it still reports `NONE` there.

- **6 — but only until the checks are plainly stuck.** A blocked PR still reporting no
  checks long after its head commit landed is not waiting on CI, it is waiting on someone
  to re-trigger it: `#1114` and `#1111` sat at zero checks with head commits 4.7 and 4.3
  hours old. `checksAreStalled` flips those to the author's move after
  `STALE_CHECKS_MS` (30 minutes, deliberately generous so a slow pipeline start is not
  mistaken for a stall). Guarded on `BLOCKED`, so a repo with no CI at all — where nothing
  gates the merge — never trips it.

  On the `gh` REST fallback the head-commit timestamp is not fetched (it would mean
  pulling the whole commit list for one field), so a stalled PR stays `machine` there
  until the next GraphQL refresh.

Regression guards, asserted over the full open set: no PR is `ready` while draft or with
changes requested; no PR is `others` with failing CI; no PR is `others` while approved
with CI not green.

**`others` is still the residual bucket**, but a much smaller one now that failing checks
and unreported checks have been routed to their real owners. What remains is
`REVIEW_REQUIRED` plus PRs that are approved and green yet still blocked — a required
deployment, an unresolved conversation, a CODEOWNER. Both are genuinely someone else's
move, which is why the column reads "waiting on others" rather than "needs review".

Rule of thumb when extending this: every branch must name *who* it is waiting on. Anything
that cannot is a residual, and residuals belong in `others` — never in a bucket that
claims a specific owner.

#### Expand / collapse

- `ui.gateDetail`, bound to `c`, toggles between `S M` and `S C R B M`.
- Collapsed by default — one column answers the question, the gates explain it on demand.
- Persisted to the PR cache alongside column visibility, so it survives restarts.
- Also reachable from the command palette as "Expand/collapse status columns", and listed
  in the help overlay.
- The responsive collapse from 036 stops being policy and becomes a clamp: the toggle is
  the preference, and width only overrides it when expanding would push the title under
  `MIN_TITLE_WIDTH`. Pressing `c` can therefore never produce an unreadable list.

### P2 - Should Have

- **Icon legend in the help overlay**, listed first so it needs no scrolling: one row per
  glyph with the glyph in its own semantic colour, plus a reminder of the expand key.
- **Scrollable help overlay** — a prerequisite, and a latent bug in its own right: the
  overlay is a fixed box whose content already exceeded a typical terminal, so the last
  sections were simply unreachable. The body is now a windowed slice of a flat row list,
  scrolled with `j`/`k`/arrows, `Ctrl+D`/`Ctrl+U`, `g`/`Shift+G`, with a
  `1-43 of 58` position indicator that only appears when there is more to see.

  Implemented by slicing rows rather than with `<scrollbox>`: that component wants
  `height` plus plain children, and putting `flexDirection` and padding on it directly
  broke both its width (it escaped the `width="50%"` modal and pinned a scrollbar to the
  terminal edge) and its content sizing (sections truncated mid-list with dead space
  below). Slicing has no layout dependency and makes the visible window exactly
  predictable.

### P3 - Nice to Have

- Split `others` into "waiting on you" vs "waiting on someone else". Half the open PRs
  land in `others`, and the valuable half is the ones waiting on the user. presto already
  resolves the current user and fetches review requests elsewhere, so the data is close to
  hand. Likely the largest remaining win.
- A discovery filter token per verdict, e.g. `>ready` or `>mine-to-fix`

## Regression tests

`src/types.test.ts` pins every verdict rule to the PR that exposed it. Each of the four
status bugs reported against this column reached the user because the rules were verified
by eye against a live fetch that then moved on; the fabricated fixtures make them
permanent and runnable offline (`just test`), which also matters because a session of
heavy API auditing can trip GitHub's secondary rate limit and block live checks entirely.

## Technical Notes

### Verification

OpenTUI repaints only changed cells, so anything that changes *after* the first paint
never appears as a contiguous string in the output stream — grepping a captured session
for `S C R B M`, or for a scroll indicator that went from `1-43` to `6-48`, proves nothing.
Confirm post-paint changes by tracing the computed value, or by restarting with the
persisted preference and reading the initial paint.

### Shifted letter keys

OpenTUI delivers `Shift+G` as `name: "g"` with `shift: true`, never as `name: "G"`. A
handler that tests `key.name === "g"` before the shifted case silently swallows both — it
is why `Shift+G` in the help overlay first jumped to the top instead of the bottom. Test
the shifted branch first.

## File Structure

```
src/
├── types.ts                      # MergeVerdict vocabulary, computeMergeVerdict, gateDetail
├── state.ts                      # TOGGLE_GATE_DETAIL, initial value from cache
├── cache/
│   ├── schema.ts                 # gateDetail in PRCache
│   └── loader.ts                 # save/getGateDetail
├── keybindings/
│   ├── types.ts                  # ui.gateDetail action
│   └── defaults.ts               # bound to "c"
├── hooks/useKeyboardNav.ts       # toggle handler
├── commands/definitions.ts       # palette entry
└── components/
    ├── PRList.tsx                # verdict glyphs, toggle-driven gate mode
    └── HelpOverlay.tsx           # help entry

specs/
└── 037-merge-verdict-consolidation.md   # this file
```
