# Fast Refresh

**Status**: Done

## Description

A refresh on a config with a large monorepo (isomorph: 264 open PRs) took ~18s, and every
repo waited for the slowest one before anything moved on screen. A `starredOnly` repo now
asks GitHub only for its starred authors' PRs, each repo's rows land as soon as that repo
answers, and the change probe no longer asks for the field GitHub is slowest to compute.

## Out of Scope

- Paginating past 50 open PRs per repo (or per starred-author search)
- Making `mergeStateStatus` cheaper on the full fetch: it is what the merge gate reads

## Capabilities

### P1 - Must Have

- A `starredOnly` repo is fetched with a search (`repo:… is:pr is:open author:a author:b …`)
  instead of its 50 most recently updated PRs. The old window held 2 of the 13 starred
  PRs in isomorph; the search holds all of them, in ~3s instead of ~10s.
- `*`, `repo:ISO` and a refresh while either is active fetch the repo unscoped, as before.
  Switching onto such a filter fetches the unscoped list on demand.
- With no starred authors a `starredOnly` repo is not fetched at all: its rows would all be
  hidden.
- Each repo's PRs replace that repo's rows as soon as its fetch lands, without ending the
  refresh spinner. The full list is still settled once every repo has answered.
- The probe digest drops `mergeStateStatus`: on isomorph that one field is 6.7s of an 8s
  probe.

### P2 - Should Have

- The digest cache is keyed by repo and author scope, so a scoped and an unscoped fetch of
  the same repo never mistake each other for "unchanged".
- A search query is split into several aliased searches when the author list would push it
  past GitHub's 256-character query limit.
- The REST fallback for a failed scoped repo searches the same authors.
- With no earlier digest to compare against (first refresh after startup, a failed last
  fetch) or on `r`, the probe is skipped: the full fetch carries every digest field and
  stores the digest itself. Saves the probe's ~1.5s per repo on those refreshes.

## Technical Notes

Measured against isomorph, 50 PRs per query:

| Query | Time |
|---|---|
| probe, with `mergeStateStatus` | 7.9s |
| probe, without | 2.5s |
| full fetch | 9.8s |
| starred search, probe | 1.2s |
| starred search, full | 3.0s |

`mergeStateStatus` is computed per PR on request, and on a monorepo whose main moves all
the time it is also what flips most often, so in the probe it both costs the most and
defeats the "unchanged" skip. Without it a PR that falls behind its base with nothing else
moving shows it one refresh late; `r` forces a full fetch.

GitHub's search index lags writes by seconds, so a PR opened by a starred author can take
one refresh longer to appear than on the repository listing.

An author that does not exist (renamed, left) matches nothing and leaves the other
authors' results intact.

## File Structure

- `src/providers/graphql.ts` — scoped queries, digest without merge state, per-repo callback
- `src/providers/github.ts` — options passthrough, scoped REST fallback
- `src/providers/source.ts`, `src/providers/demo/index.ts` — interface
- `src/hooks/usePRData.ts` — scope computation, streamed rows, unscoped fetch on bypass
- `src/state.ts` — `REPLACE_REPO_PRS`
