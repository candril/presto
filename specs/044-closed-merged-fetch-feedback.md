# Closed/Merged Filter Feedback

**Status**: Done

## Description

`state:closed` and `state:merged` need data the normal open-PR fetch never loads, so
applying either filter is a multi-second round trip to `gh` for every configured repo.
This spec covers what the list shows during that round trip and how results land, so the
filter reads as "searching" rather than "nothing here, and here is an odd toast".

## Out of Scope

- Pagination beyond the 100-per-repo, 30-day window of spec 026
- Caching closed/merged results across app restarts
- Changing which repos are queried, or the `gh` query itself

## Capabilities

### P1 - Must Have

- **Searching state instead of an empty list**: while a closed/merged fetch is queued or
  in flight and nothing matches yet, the list shows a spinner ("Searching merged pull
  requests…") rather than "No pull requests found". The state is set when the filter is
  recognised, before the 300ms debounce, so no empty flash precedes it.
- **Results stream per repo**: each repo's result is appended as it arrives, instead of
  every repo waiting on the slowest one.
- **A refresh keeps the results**: `SET_PRS` replaces the list with open PRs, which these
  are not, so every refresh emptied the list under a `state:merged` filter and re-queried
  every repo to refill it. What the backfill found is kept and put straight back.
- **Failed repos stay retryable**: a repo whose query fails is not recorded as fetched,
  so the next filter change or refresh retries it. A failure currently looks like an
  empty result, which is why some PRs only appear after a manual refresh.
- **No progress toasts**: the spinner and the list itself carry the state. The
  "Loading merged PRs…" / "Found N merged PRs" toasts of spec 026 are dropped — they
  expire on a 2s timer unrelated to the fetch and say nothing the list does not. A toast
  remains only when every repo failed.

### P2 - Should Have

- **Header spinner spans the whole fetch**: the refreshing indicator clears when the last
  repo settles, not when the first one does.

### P3 - Nice to Have

- **Per-repo progress count**: "Searching merged pull requests… 3/8 repos".

## Technical Notes

`listPRsByState` in `src/providers/github.ts` swallows errors and returns `[]`. That makes
a rate-limited or failing repo indistinguishable from one with no matches, and the caller
then records it as fetched. It rethrows instead; `usePRData` decides what a failure means.

The fetch effect in `usePRData.ts` keeps its 300ms debounce and its `fetchedClosedRepos` /
`fetchedMergedRepos` claim sets (claimed inside the timer so a keystroke burst fires one
fetch per repo), and gains:

- an in-flight counter ref, so `SET_REFRESHING`/`SET_CLOSED_MERGED_LOADING` clear once,
  when the last repo settles
- `APPEND_PRS` per repo rather than one `Promise.all`
- `fetched.delete(cacheKey)` in the per-repo catch

The backfilled PRs are kept in a `closedMergedPRs` ref, keyed by URL, and re-appended
right after each `SET_PRS` in `fetchPRs`. The re-query still runs — a refresh should bring
fresh data — but the list no longer empties while it is in flight. `APPEND_PRS` returns
the state unchanged when it adds nothing, so a restore that finds everything already
present costs no render.

`AppState` gains `closedMergedLoading`, set as soon as the effect finds repos to query.
`App.tsx` renders `<Loading>` when the filter asks for closed or merged PRs, the flag is
set, and the filtered list is empty — the filter check keeps a fetch that outlives its
filter from mislabelling an ordinary empty result.

## File Structure

```
src/
├── providers/github.ts   # listPRsByState rethrows instead of returning []
├── types.ts              # AppState.closedMergedLoading
├── state.ts              # SET_CLOSED_MERGED_LOADING, APPEND_PRS no-op
├── hooks/usePRData.ts    # streaming fetch, retry on failure, loading flag,
│                         # restore backfilled PRs after a refresh
└── App.tsx               # searching spinner for the empty list
```
