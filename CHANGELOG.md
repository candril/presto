# Changelog

All notable changes to presto are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

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

[Unreleased]: https://github.com/candril/presto/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/candril/presto/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/candril/presto/releases/tag/v0.1.0
