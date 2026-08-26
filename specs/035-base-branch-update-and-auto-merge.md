# Base branch update & auto-merge

**Status**: In Progress

## Description

Let the user bring a PR's branch up to date with its base branch, and arm GitHub's
auto-merge ("merge when ready") on a PR, both from the command palette. Surface the
underlying merge state in the PR list as a one-character icon so it is visible which
PRs are behind their base branch (or conflicting) without opening anything.

## Out of Scope

- Dedicated keybindings — all three actions are command-palette only, like the review
  and workflow dialogs
- Resolving merge conflicts (only reporting them)
- Auto-merge on repos that have the feature disabled — the dialog reports it, it does
  not flip the repo setting
- A discovery filter token for behind/conflicting PRs

## Capabilities

### P1 - Must Have

- **`mergeStateStatus` on `PR`** — GitHub's computed merge state
  (`BEHIND` / `DIRTY` / `BLOCKED` / `CLEAN` / `UNSTABLE` / `DRAFT` / `HAS_HOOKS` /
  `UNKNOWN`), fetched by both the GraphQL bulk path and the `gh` REST path.
- **`autoMergeMethod` on `PR`** — the merge method auto-merge is armed with, or `null`
  when auto-merge is off.
- **`sync` column** in the PR list, 1 char, visible by default, toggleable like every
  other column. Priority order (a PR can be in several of these states at once; the
  most actionable wins):
  | State | Icon | Colour |
  |---|---|---|
  | `DIRTY` — conflicts with base | `✗` | error |
  | `BEHIND` — base has moved on | `↓` | warning |
  | auto-merge armed | `⇢` | secondary |
  | anything else | `-` | muted |
- **Update branch command** `state.update_branch` — "Update branch from base", available
  on open PRs. Runs `gh pr update-branch <n> -R <repo>` (merge commit).
- **Update branch (rebase)** `state.update_branch_rebase` — same, with `--rebase`.
  Separate command because the choice is a repo/team policy, not a per-run decision.
- **Enable auto-merge** `state.auto_merge` — available on open PRs that do not already
  have auto-merge armed. Opens the existing merge dialog in `auto` mode to pick the
  merge method, then runs `gh pr merge <n> -R <repo> --auto --<method>`.
- **Disable auto-merge** `state.disable_auto_merge` — available when `autoMergeMethod`
  is set. Runs `gh pr merge <n> -R <repo> --disable-auto`.
- **Optimistic updates**: enabling/disabling auto-merge updates `autoMergeMethod`
  immediately; a successful branch update clears a `BEHIND` state to `UNKNOWN` (GitHub
  needs a moment to recompute, and `UNKNOWN` renders as "no icon" rather than a stale
  "behind" arrow).

### P2 - Should Have

- **Auto-merge mode in the merge dialog**: header reads "Enable auto-merge", the
  not-mergeable gate is lifted (arming auto-merge on a PR that is *not* yet mergeable is
  the whole point), and the footer reads "Enter to enable auto-merge".
- **Repo capability check**: `allowAutoMerge` added to the cached `RepoMergeSettings`.
  When the repo has auto-merge disabled, the dialog shows an error line and Enter is
  inert.

### P3 - Nice to Have

- Icon legend in the help overlay

## Technical Notes

### Fetching the merge state

`mergeStateStatus` and `autoMergeRequest` are both plain fields on `PullRequest` — no
preview `Accept` header needed — and both are exposed by `gh pr list --json`, so the
GraphQL bulk path and the `gh` REST fallback stay in sync.

```graphql
mergeStateStatus
autoMergeRequest { mergeMethod }
```

Cost: measured at roughly +0.9s on a 50-PR single-repo query, because GitHub computes a
test merge commit to answer it. Repos are fetched in parallel, so this is ~1s of added
wall-clock on a refresh, not 1s per repo. Worth it — being behind the base branch is
invisible otherwise.

`mergeStateStatus` is `UNKNOWN` while GitHub is still computing the test merge. That is
transient and must render as "nothing to show", never as an error state.

`viewerCanUpdateBranch` would be a more precise signal for the update command (it is
true only when the branch is behind *and* the viewer may push), but `gh pr list --json`
does not expose it, so the two fetch paths could not agree. `mergeStateStatus` alone is
used instead, and the update commands stay available on any open PR — GitHub rejects the
call with a readable message if it does not apply.

### New action modules

`src/actions/branch.ts`:

```typescript
export async function updateBranchFromBase(
  pr: PR,
  strategy: "merge" | "rebase"
): Promise<BranchActionResult>
```

`src/actions/automerge.ts`:

```typescript
export async function enableAutoMerge(pr: PR, method: MergeMethod): Promise<...>
export async function disableAutoMerge(pr: PR): Promise<...>
```

Both shell out via `gh` and return `{ success, message }`, surfacing `gh`'s stderr on
failure — same shape as `submitPRReview` / `executeMerge`.

### Merge dialog reuse

`MergeDialogState` gains `mode: "merge" | "auto"`. `CommandResult` gains
`{ type: "auto_merge_dialog" }`, which loads the same repo settings + PR merge state and
opens the dialog with `mode: "auto"`. The keyboard branch is shared; only the mergeable
gate, header and footer differ.

## File Structure

```
src/
├── types.ts                      # MergeStateStatus, PR fields, sync column, needsBaseUpdate()
├── cache/schema.ts               # sync column default
├── providers/
│   ├── graphql.ts                # fragment fields + transform
│   └── github.ts                 # PR_FIELDS + transform
├── actions/
│   ├── branch.ts                 # NEW: updateBranchFromBase()
│   ├── automerge.ts              # NEW: enable/disableAutoMerge()
│   └── index.ts                  # re-exports
├── commands/
│   ├── types.ts                  # auto_merge_dialog result
│   └── definitions.ts            # 4 new commands, allowAutoMerge, sync column name
└── components/
    ├── PRList.tsx                # sync column rendering
    └── CommandPalette.tsx        # auto mode in merge dialog

specs/
└── 035-base-branch-update-and-auto-merge.md   # this file
```
