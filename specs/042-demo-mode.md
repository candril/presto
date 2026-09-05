# Demo Mode

**Status**: Done

## Description

`presto --demo` runs the whole app against a built-in, in-memory GitHub: a fictional
org with three repos and a couple of dozen PRs that cover every status column state and
every merge verdict. No `gh`, no network, no config. Actions work — approve, merge,
auto-merge, update branch, re-run checks — and are forgotten on exit. It is what a new
user runs before configuring anything, and what every docs screenshot is taken from.

## Out of Scope

- Recording or replaying real GitHub data
- A demo that survives restarts (the scratch state is wiped on every launch)
- Simulating GitHub's timing precisely — checks "run" for a few seconds, not minutes

## Capabilities

### P1 - Must Have

- **One seam**: everything that talks to GitHub or the outside world (list, preview,
  review, merge, auto-merge, update branch, checks, workflows, browser/riff/diff/checkout)
  goes through a `PRSource` interface. The `gh`-backed implementation is the default;
  `--demo` swaps in the in-memory one. No `if (demo)` anywhere in the UI.
- **Isolated state**: the demo never reads or writes `~/.config/presto`. History, cache
  and tabs live in a throwaway directory, wiped on each launch, so the demo starts the
  same way every time. `PRESTO_CONFIG_DIR` overrides the location (the screenshot
  harness sets it).
- **Every verdict represented**: the fixture has at least one PR for each merge verdict
  (ready, author's move — each of its reasons —, waiting on others, machine's move,
  auto-merge, draft) and each column glyph, including the dim optional-behind arrow and
  the stalled-checks case.
- **Writes mutate the store**: approving flips the review column, merging turns the row
  purple, arming auto-merge shows `⇢`, updating a branch changes the head commit so the
  pending marker clears on refresh, re-running checks moves them from red to running to
  green. GitHub's refusals are reproduced where they matter (approving your own PR,
  arming auto-merge on a PR that is already mergeable).
- **External tools are inert**: browser, riff, diff, checkout and tmux report what they
  would have done in the status line instead of doing it.
- **Header says so**: a dim `demo` marker next to the title, so no screenshot can be
  mistaken for real data.

### P2 - Should Have

- **Timestamps relative to now**: fixture dates are offsets from launch time, so the
  time column reads `2h`, `3d` today and next year alike.
- **Merged and closed history**: `state:merged` / `state:closed` find something.
- **Workflows**: the trigger-workflow dialog lists dispatchable workflows with inputs,
  including an `environment` input, and "triggers" them.
- **Slight latency**: reads take ~100–250 ms so the refresh spinner is visible, as it is
  against the real API.

### P3 - Nice to Have

- `--help` and `--version` flags, since the CLI now parses arguments at all

## Technical Notes

### The seam

```ts
// src/providers/source.ts
export interface PRSource {
  init(): Promise<void>
  getCurrentUser(): Promise<string>
  listPRs, listClosedPRs, listMergedPRs, listPRsFromRepos, getPRsByBranch, getPR,
  getPRsBulk, fetchPRPreview,
  submitPRReview, executeMerge, enableAutoMerge, disableAutoMerge, updateBranchFromBase,
  markReady, convertToDraft, closePR, reopenPR, getPRMergeState, getRepoMergeSettings,
  rerunChecks, openFailingChecks,
  listWorkflows, getWorkflowInputs, getRepoEnvironments, isForkPR, dispatchWorkflow,
  openInBrowser, openRepoInBrowser, openInRiff, openInRiffTmuxWindow, openDiff, checkoutPR
}
```

`src/providers/index.ts` holds the active source and re-exports one function per method,
so call sites keep importing plain functions — only the import path changes. The `gh`
implementations stay where they are (`providers/github.ts`, `providers/graphql.ts`,
`actions/*.ts`); the façade composes them. The merge and draft/close/reopen calls that
lived inline in `commands/definitions.ts` move to `actions/merge.ts` and
`actions/state.ts` so they can be composed too.

Tool opens return `{ success, message }` like every other action, so the demo can say
"would open …" through the same status line.

### The demo source

`src/providers/demo/` — `fixtures.ts` (the org, its people and PRs, previews, workflows),
`store.ts` (mutable copy of the fixtures plus the mutations and their timers),
`index.ts` (the `PRSource` over the store). Fixture dates are `hoursAgo(n)` from a
`now` captured at load.

### Startup

`src/index.tsx` parses `process.argv`. With `--demo` it points `PRESTO_CONFIG_DIR` at
`$TMPDIR/presto-demo` (unless already set), wipes it, installs the demo source, and
builds the config from the fixture repos instead of reading `config.toml`. Config, cache,
history and tabs resolve their paths lazily through `getConfigDir()` so the override
takes effect regardless of import order.

## File Structure

- `src/providers/source.ts` — the interface
- `src/providers/index.ts` — active source + re-exports
- `src/providers/demo/{fixtures,store,index}.ts` — the demo
- `src/actions/merge.ts`, `src/actions/state.ts` — extracted from `commands/definitions.ts`
- `src/actions/tools.ts`, `src/actions/checkout.ts` — return results instead of void
- `src/config/loader.ts`, `src/cache/loader.ts`, `src/history/loader.ts`,
  `src/tabs/persistence.ts` — lazy paths, `PRESTO_CONFIG_DIR`
- `src/index.tsx` — argument parsing, demo wiring
- `src/App.tsx`, `src/components/Header.tsx` — demo marker
- `src/hooks/*`, `src/commands/definitions.ts`, `src/components/CommandPalette.tsx` —
  import from `../providers`
