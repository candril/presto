# Check actions

**Status**: Done

## Description

Two actions for acting on the CI that a PR's checks column reports: jump to the failing
workflow in the browser (`x`), and re-run the finished-but-red workflow runs for the PR's
head commit (palette, confirmed). Completes the loop that specs 036/037 opened — the
status columns *say* CI is the problem; these act on it.

## Out of Scope

- Watching a re-run's progress (the checks column reflects it on the next refresh)
- Re-running a single named check (GitHub's re-run is per workflow run)
- Log viewing inside presto — the browser is the right place for logs

## Capabilities

### P1 - Must Have

- **`action.checks`** — "Open failing checks in browser", bound to `x`, also in the
  palette and help overlay. Opens the page that answers "why is CI holding this up":
  | rollup says | opens |
  |---|---|
  | exactly one red check | that check's job page (`detailsUrl`), no hunting |
  | several red | the PR's checks tab, which lists them together |
  | none red, checks exist | the checks tab (where re-run lives) |
  | no checks at all | the branch's workflow-run list — a PR blocked on checks that never reported has an *empty* checks tab, and the queued runs are on the Actions page |
- **`action.rerun_checks`** — "Re-run checks", palette-only and `dangerous: true`
  (each invocation spends real CI on shared runners; the existing y/N confirmation
  covers it). Lists the head commit's workflow runs and re-runs every one that finished
  badly (`failure`, `timed_out`, `startup_failure`, `cancelled`).
  - `--failed` where failed jobs exist, so green jobs are not repeated
  - a full re-run for `startup_failure` **and** `cancelled` — neither ever created
    jobs, so `--failed` would select nothing (observed on `Dg.GalaxusAbos#1114`,
    whose queued Security run was cancelled with zero jobs)
  - still-queued or in-progress runs are reported, not re-run
  - nothing finished at all → points at *Trigger workflow…* instead

### P2 - Should Have

- Legacy commit statuses (`StatusContext`) handled via `state`/`targetUrl` alongside
  check runs

## Technical Notes

`detailsUrl` comes from `gh pr view --json statusCheckRollup`, fetched on demand — the
bulk list query only carries the collapsed rollup state, and URLs for every check on
every row would bloat it for a field used one PR at a time.

Both decision functions are pure (`chooseChecksTarget`, `selectRerunnableRuns` /
`rerunNeedsFullRun`) and tested against captured payloads in
`src/actions/checks.test.ts` — the side effects (browser, `gh run rerun`) cannot be
exercised in tests, so everything up to them is.

## File Structure

```
src/
├── actions/
│   ├── checks.ts            # NEW: openFailingChecks, rerunChecks + pure helpers
│   ├── checks.test.ts       # NEW: target choice + rerun selection fixtures
│   └── index.ts             # re-exports
├── keybindings/
│   ├── types.ts             # action.checks
│   └── defaults.ts          # bound to "x"
├── hooks/useKeyboardNav.ts  # x handler
├── commands/definitions.ts  # palette entries (rerun is dangerous:true)
└── components/HelpOverlay.tsx

specs/
└── 038-check-actions.md     # this file
```
