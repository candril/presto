# Preview status header

**Status**: Done

## Description

The preview panel's header renders the same S/C/R/B/M status columns as the list row —
same glyphs, same colours, same data — with each one's meaning spelled out. The preview
doubles as the legend for the single-letter columns, and carries the row's full story:
checks, review state, branch state, open comment threads, and *why* the merge verdict
says what it says.

## Out of Scope

- Changing the preview's sections below the header (comments, reviews, files, commits)
- Fetching anything new — the header derives entirely from data already loaded

## Capabilities

### P1 - Must Have

- **Status block** after the title, one row per list column:
  ```
  S ○  Open
  C *  Checks queued — none started yet
  R ✓  Approved
  B ✓  Up to date with master
  M !  Author's move — checks never started, re-trigger CI
  ```
- **Derived from the list-row `PR`, not from `PRPreview`.** The two are fetched at
  different times, and `PRPreview.mergeable` is a weaker field than `mergeStateStatus` —
  deriving the header from the preview fetch could contradict the row it explains.
  `PreviewPanel` takes the selected `PR` (and its pending-action flag) as props.
- **The M row names the rule that fired.** `computeMergeVerdictDetail` returns
  `{ verdict, reason }` and `computeMergeVerdict` delegates to it — one code path, so the
  explanation can never disagree with the glyph. Reasons include the open-thread count,
  the auto-merge method, and "checks never started — re-trigger CI" for the stalled case.
- **Metadata rows** keep Author / Branch / Changes and gain
  `Comments  N · M unresolved threads` (threads amber when nonzero). The old
  `Status` and `Checks — Mergeable` rows are subsumed and removed.
- **Shared vocabulary module `src/status.ts`**: the five indicator functions and the
  `ICONS` table move out of `PRList` so both surfaces render from one definition;
  `buildStatusRows` composes the explained rows.

### P1.5 - Added after Dg.GalaxusAbos#1090

**A null `reviewDecision` is not proof of "no review".** #1090 carried two standing
approvals while GitHub reported `reviewDecision: null` for over a day (non-draft, same
rulesets as a sibling PR that reported `APPROVED`, commits fully attributed — GitHub's
reasoning is not observable from outside). The R column now falls back to the review
receipts:

- `approvedBy` on `PR`: humans whose latest opinionated review is an approval, from
  `latestOpinionatedReviews` on the GraphQL path and derived from the reviews array
  (last opinionated state per author) on the REST path.
- Null decision + standing approvals → dim `✓`, preview text
  `Approved by … — GitHub reports no decision`. A dim tick, not a green one: the
  approvals stand, but GitHub is not counting them as the decision.
- A real `APPROVED` decision now also names the approvers in the preview.
- The verdict is unchanged by the fallback — on #1090 the open review thread still owns
  it, which matches the ruleset (`required_review_thread_resolution: true`).

### P2 - Should Have

- Bot-filtered comment counts on the REST path. The GraphQL path already counted only
  human comments; `gh pr list` / preview counts were raw, so the same PR could show
  different numbers depending on fetch path.

## Technical Notes

`dg-pull-request` and `copilot-pull-request-reviewer` match none of the built-in bot
patterns. They are excluded via user config (`botPatterns.patterns` in
`~/.config/presto/config.toml`) — which in this setup is a home-manager symlink into the
read-only nix store, so it is changed in the home-manager source, not in place:

```toml
[botPatterns]
patterns = ["^dg-pull-request$", "^copilot-pull-request-reviewer$"]
```

## File Structure

```
src/
├── status.ts                    # NEW: indicators + ICONS (from PRList) + buildStatusRows
├── types.ts                     # computeMergeVerdictDetail (verdict + reason)
├── components/
│   ├── PRList.tsx               # imports indicators from status.ts
│   └── PreviewPanel.tsx         # status block, Comments row, pr + hasPendingAction props
├── providers/github.ts          # human-only comment counts (countHuman)
└── App.tsx                      # passes selectedPR + pending flag

specs/
└── 039-preview-status-header.md # this file
```
