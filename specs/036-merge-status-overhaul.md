# Merge status overhaul

**Status**: In Progress

## Description

Restructure the PR list's status indicators around one question per column: an overall
"can this merge?" verdict, the gates that explain a negative verdict, and what the user
can do about it. Adds a merge-verdict column, makes the gate cluster collapse on narrow
layouts, distinguishes GitHub-is-computing from all-clear, and marks PRs where an action
the user fired is still in flight.

Supersedes the `sync` column introduced in [035](035-base-branch-update-and-auto-merge.md),
which reported behind-ness from the wrong source.

## Out of Scope

- ~~Unresolved review conversations as a gate.~~ **Reversed in
  [037](037-merge-verdict-consolidation.md).** The measurement behind this exclusion asked
  whether unresolved threads explained `BLOCKED`, sampled three PRs, and found nothing. The
  question was wrong: this team blocks by *commenting* rather than by requesting changes,
  so an open thread gates the PR socially even when GitHub reports it as merely awaiting
  review.
- Animating the in-flight marker
- Persisting in-flight markers across restarts
- Per-check detail (that is the preview panel's job)

## Capabilities

### P1 - Must Have

#### Correct behind-base detection

`mergeStateStatus` is a single priority-collapsed value, so `BLOCKED` masks `BEHIND`:
`Dg.ShopMobileApp#191` is blocked on review *and* behind base, and spec 035's column
shows nothing. The independent signal is `viewerCanUpdateBranch`.

- **`canUpdateBranch` on `PR`** — from GraphQL. `gh pr list --json` does not expose it,
  so the REST fallback derives `mergeStateStatus === "BEHIND"` and under-reports exactly
  as before. That path only runs when a repo's GraphQL fetch fails, and the next
  successful refresh corrects it.
- **`baseRefName` on `PR`** — needed to look up branch rules, and lets the merge dialog
  show the target branch without its own API round-trip.
- **`baseUpdateRequired` on `PR`** — whether being behind actually blocks the merge,
  stamped in the provider (see Technical Notes).

#### Merge verdict column `M`

| `mergeStateStatus` | icon | colour | meaning |
|---|---|---|---|
| `CLEAN` / `HAS_HOOKS` | `✓` | success | mergeable right now |
| `UNSTABLE` | `~` | warning | mergeable; a non-required check is red |
| `BEHIND` | `↓` | warning | base must be merged in first |
| `DIRTY` | `✗` | error | conflicts with base |
| `BLOCKED` | `-` | muted | gated — the C and R columns say why |
| `DRAFT` | `◌` | muted | draft (same glyph as the state column) |
| `UNKNOWN` | `…` | muted | GitHub is still computing the test merge |

`-` stops being the catch-all for "nothing to say" and means one specific thing, so
every other cell in the column is a real signal.

Two overrides, highest priority first:

| condition | icon | colour |
|---|---|---|
| an action the user fired is in flight | `↻` | warning |
| auto-merge armed | `⇢` | secondary |

#### Base column `B`, rebuilt

Single purpose: is the base branch ahead of this PR, and does that block it.

| condition | icon | colour |
|---|---|---|
| `canUpdateBranch && baseUpdateRequired` | `↓` | warning |
| `canUpdateBranch` only | `↓` | muted |
| otherwise | `-` | muted |

Conflicts move out of `B` and live only in `M` — `B` answers "should I pull base in",
`M` answers "can this merge". Showing `✗` in both was duplication.

#### Responsive gate collapse

The status indicators collapse when the list is too narrow to afford them, which is the
normal case with the preview panel open on the right.

- **Full**: `S C R B M`
- **Compact**: `S M` — the verdict is the summary; C, R and B are the detail
- The switch is driven by the title space actually left over, not by a raw terminal
  width, so it respects which other columns the user has turned off:
  collapse when `listWidth - fixedWidth(full) < MIN_TITLE_WIDTH` (32).
- Consequence worth knowing: at 80 columns with both the author and repo columns on,
  full mode leaves only 23 characters of title, so the list collapses to `S M`. Hiding
  the repo column (34 characters go to author + repo combined) restores the full gates.
- Column visibility is a mask, not an override: collapsing hides C/R/B, it never
  force-shows a column the user turned off. Hiding `M` in compact mode leaves `S` alone.
- The header row switches with it.

#### In-flight action markers

After firing *Update branch*, GitHub accepts the request and applies it asynchronously,
so the row sits unchanged for seconds.

Only branch updates get a marker. Merging and arming auto-merge already update the row
optimistically (`state`, `autoMergeMethod`) and take effect immediately, so a marker
there would add flicker and nothing else. `PendingActionKind` is a one-member union
rather than a general mechanism looking for a use.

- `AppState.pendingActions: Record<string, PendingAction>`, keyed by PR key, holding
  `{ kind, firedAt }`. Memory only — a stale marker surviving a restart is worse than
  losing one.
- Rendered as `↻` over the `M` column.
- Cleared on the first refresh whose data shows the action landed — for
  `update-branch`, when `headRefOid` changed.
- Firing it also optimistically clears `canUpdateBranch`, so the base column stops
  telling the user to do what they just did. A refresh restores the arrow if the update
  did not land.
- Also cleared by a 2 minute TTL, so a failed or externally-reverted action cannot pin
  a marker forever.

### P2 - Should Have

None outstanding. Two candidates were considered and dropped:

- *Merge dialog reusing the PR's `baseRefName` instead of calling `getPRMergeState`* —
  no saving, since the dialog still needs that call's fresh `mergeable` check immediately
  before merging, which is worth more than one field.
- *Icon legend in the help overlay* — the overlay is a fixed, non-scrolling box that
  already overflows on a 50-row terminal at ~50 lines of content. Six more lines makes an
  existing bug worse. Needs the overlay to scroll first.

### P3 - Nice to Have

- A `>behind` discovery filter token
- Make the help overlay scrollable, then add the icon legend

### Merge dialog gate (added after Dg.GalaxusAbos#1114)

The dialog used to gate on REST's `mergeable` boolean, which only answers "no
conflicts": a PR behind a strict base — or blocked by protection — reports
`mergeable: true` and then has the merge call rejected. And while GitHub recomputes the
test merge, `mergeable` is `null`, which rendered as a flat "PR cannot be merged" on a
row that was all green.

- The gate is now `mergeable_state ∈ {clean, unstable, has_hooks}` — the field that
  actually decides whether GitHub takes the merge (`isMergeableState`).
- `unknown` gets its own message ("GitHub is still computing — close and retry"), and
  `behind` points at the *Update branch from base* command.
- The dialog's fetch is fresher than the list refresh that drew the row, so its
  `mergeable_state` is pushed back into the row via `UPDATE_PR`
  (`mergeableStateToStatus`) — the row and the dialog can no longer contradict each
  other on screen. `behind` also flips the row's `baseSync`, since REST only reports
  `behind` when the base requires up-to-date branches.

## Technical Notes

### Is being behind actually blocking?

Classic branch protection (`repos/{repo}/branches/{branch}/protection`) returns 404
without admin rights on these repos. The rulesets endpoint
`repos/{repo}/rules/branches/{branch}` needs only read access and carries the same fact:

```
required_status_checks → parameters.strict_required_status_checks_policy
```

Several rulesets can apply to one branch, so strictness is `any(rule.strict)`. Verified:
`Dg.GalaxusAbos` → `true` (its behind PRs report `BEHIND`), `Dg.ShopMobileApp` → `false`
(its behind PR reports `CLEAN`).

Resolved once per `repo@branch` and cached for the process, then stamped onto each PR as
`baseUpdateRequired` during the fetch, so rendering stays synchronous and the flag
survives in the on-disk PR cache.

The stamp is `mergeStateStatus === "BEHIND" || strict(repo, baseRefName)`. The first term
means a wrong or unavailable rules lookup still cannot produce a *dim* arrow on a PR that
GitHub itself reports as blocked-because-behind — the fallback is self-correcting, and
an unreachable endpoint degrades to "optional" rather than crying wolf.

### Fetch cost

`viewerCanUpdateBranch` and `baseRefName` add nothing measurable — the expensive field,
`mergeStateStatus`, is already being fetched as of spec 035. The rules lookup is one
extra request per `repo@branch`, cached for the process lifetime.

### Glyph widths

Every glyph is either already in use in this app (`○ ◌ ● ✓ ✗ ↓ ⇢ * ! ? -`) or
unambiguously single-width (`~`, `…`). `↻` (U+21BB) is in the same Arrows block as the
`↓` and `⇢` already rendering correctly, but is worth eyeballing in a real terminal.

## File Structure

```
src/
├── types.ts                      # canUpdateBranch, baseRefName, baseUpdateRequired,
│                                 # MergeVerdict, PendingAction, computeMergeVerdict()
├── state.ts                      # pendingActions + SET/CLEAR actions, settle-on-refresh
├── providers/
│   ├── branchRules.ts            # NEW: cached strict-required-status-checks lookup
│   ├── graphql.ts                # new fields + stamping
│   └── github.ts                 # new fields + stamping, REST derivation
├── commands/definitions.ts       # fire pendingActions on the three mutating commands
└── components/
    ├── PRList.tsx                # M column, rebuilt B, responsive collapse
    ├── CommandPalette.tsx        # pending on merge/auto-merge, baseRef from PR
    └── HelpOverlay.tsx           # icon legend

specs/
└── 036-merge-status-overhaul.md  # this file
```
