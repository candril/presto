# Changelog

All notable changes to presto are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

## [0.4.0] — 2026-11-11

### Added

- **Rows name the blocker.** Where the Merge glyph alone is ambiguous, the end of the
  title says in one muted word what is in the way: `conflicts`, `2 failing`, `behind`,
  `2 threads`, `CI 5/8`, `computing`, `blocked`. Ready, review and auto-merge keep the
  bare glyph, and only rows with a reason give up title width for it.
- **The reason's colour is what the PR needs from you.** Green when nothing more is needed
  from you (`ready` on your mergeable PR, `approved` on one you signed off), amber when the
  author has to act, blue for a review you could give, muted for CI and everything that
  is not yours.
- **Merge queue.** A queued PR shows `⧗` and `#1 ~3m`: its place in line and GitHub's
  estimate, green once GitHub calls it mergeable in the queue.
- **Merge status in the preview.** The preview opens with the verdict, then one line per
  gate: checks (with the failing and running ones named), reviews (who approved, who
  requested changes, who is still asked), conversations, conflicts, how many commits
  behind its base the branch is, the queue, and what else blocks.
- **The header says how fresh the list is.** The age is stamped when a refresh finishes,
  not when it starts, and a refresh that failed stamps nothing; it ticks every 30s, shows
  the cache's age on a start from disk, and turns amber with `! 1 repo stale` when a repo's
  rows are kept from an earlier fetch. While repos are still answering, the spinner counts
  them: `3/5`.
- **Tabs move with `{` and `}`.** The current tab moves one place left or right and `1`–`9`
  follow the new order; *Move Tab Left* / *Move Tab Right* are in the palette.
- **A bare number filters by PR number.** `482` narrows the rows already listed to PRs
  numbered 482 and fetches nothing; `#482` is still the lookup across every repo.

### Changed

- **Refresh on a big monorepo drops from ~18s to ~5s.** A `starredOnly` repo now asks
  GitHub for its starred authors' PRs only, instead of its 50 most recently updated and
  then hiding the rest — on isomorph that window held 2 of the 13 starred PRs, so most
  were missing altogether. `*` and `repo:` still load every author. Each repo's rows also
  land as soon as that repo answers rather than waiting on the slowest one, and the
  change check no longer asks for the merge state, which GitHub is slowest to compute. The
  first refresh after startup and `r` skip that check altogether, since there is nothing
  yet to compare it with.

### Fixed

- **The list no longer shows stale merge state.** The change check now notices the base
  branch moving, which is what turns a PR behind or conflicting, and a repo is fetched in
  full at least every 15 minutes even when nothing seems to have changed. Opening the
  preview refetches that PR's row, so the two never disagree; a merge state GitHub was
  still computing is asked for again 5s later; and after merge, auto-merge, a review,
  ready/draft, close, reopen or update branch the PR is fetched again after 2s and 10s, so
  GitHub's answer replaces the optimistic one even when the action failed. The palette's
  *Refresh PRs* now forces a full fetch like `r`.
- **The selection stays on its PR when a refresh reorders the list.** A PR that moved up
  used to push another one under the cursor, so `y` copied and `Enter` opened a PR you
  never picked.

## [0.3.0] — 2026-09-25

### Changed

- OpenTUI 0.5.12 and `smol-toml` 1.9.

### Added

- **Rows fade as they age.** A PR nobody has touched for three weeks dims, one untouched for
  six sits at the floor, and the status glyphs keep their colour throughout — an old PR with
  a failing check is still the one that catches the eye. `[display] fade_after_days` and
  `fade_floor` tune it; `fade_after_days = 0` turns it off.

- An `@author` filter now fetches that person's open PRs instead of only filtering the
  ones already loaded. The initial load is the 50 most recently updated open PRs per repo,
  so on a busy repo somebody's older PR was missing from their own tab entirely — it is
  asked for by name now, per repo, as each answer arrives. What it finds stays on screen
  across a refresh, and a refresh only re-asks about the people whose tab is open.

### Fixed

- `state:merged` and `state:closed` no longer read as "No pull requests found" while the
  query is still running: the list says it is searching, each repo's results appear as
  they arrive instead of behind the slowest one, and the progress toasts are gone.
- A refresh no longer empties the list under `state:merged` or `state:closed`. The
  refresh replaces the list with open PRs, which these are not, so they vanished for as
  long as it took to query every repo again.
- A repo whose closed/merged query fails is retried on the next filter change. It used to
  be recorded as fetched, so its PRs stayed missing until a manual refresh.

## [0.2.0] - 2026-09-14

### Changed

- **OpenTUI 0.1.87 to 0.5.11**, the terminal renderer everything is drawn with, together with
  `@opentui/react` and React 19.3. The one API break was the renderer's console option; screenshots
  taken before and after are pixel-identical, so nothing about the rendering changed.
- Docs site to Astro 7 and Starlight 0.42, two majors.
- `smol-toml` 1.8, `yaml` 2.9.1 and `@types/bun` 1.4.2. The OpenTUI version is now pinned exactly
  rather than floating on a caret range.
- GitHub Actions moved to the Node 24 majors ahead of Node 20 being removed from hosted runners on
  23 September 2026.
- The build now declares the minimum Bun it needs and refuses to run below it, so an incompatible
  runtime says so instead of failing later with an unexplained internal error.

## [0.1.0] - 2026-09-06

First release.

### Added

- **One list** — every open PR across the repositories in your config, with five status
  glyphs per row: state, checks, review, base and the merge verdict — whose move it is.
- **Tabs** — a tab per filter, each with its own cursor, restored on the next launch.
- **Preview** — the five columns spelled out, then comments, reviews, the description as
  Markdown, files and commits.
- **Actions** — review, merge, auto-merge, update the branch from base, re-run checks,
  trigger a workflow, checkout, open in riff or the browser, all from the command palette.
- **Filtering** — `@me`, `repo:`, `state:`, `>unread`, `>marked`, free text, or a pasted
  PR URL.
- **Change detection** — every refresh diffs against the last snapshot; changed PRs get a
  dot and a toast.
- **Demo mode** — `presto --demo` runs against a built-in org with no GitHub, no config
  and nothing written to disk.
- Prebuilt binaries for macOS (arm64, x64) and Linux (x64, arm64), a curl installer, a
  Homebrew formula and a Nix package via [candril/homebrew-tap](https://github.com/candril/homebrew-tap).

[Unreleased]: https://github.com/candril/presto/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/candril/presto/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/candril/presto/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/candril/presto/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/candril/presto/releases/tag/v0.1.0
