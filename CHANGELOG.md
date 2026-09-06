# Changelog

All notable changes to presto are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

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

[Unreleased]: https://github.com/candril/presto/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/candril/presto/releases/tag/v0.1.0
