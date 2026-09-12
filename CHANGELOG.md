# Changelog

All notable changes to presto are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

### Changed

- **OpenTUI 0.1.87 to 0.5.11**, the terminal renderer everything is drawn with, together with
  `@opentui/react` and React 19.3. The one API break was the renderer's console option; screenshots
  taken before and after are pixel-identical, so nothing about the rendering changed.
- Docs site to Astro 7 and Starlight 0.42, two majors.
- `smol-toml` 1.8, `yaml` 2.9.1 and `@types/bun` 1.4.2. The OpenTUI version is now pinned exactly
  rather than floating on a caret range.
- GitHub Actions moved to the Node 24 majors ahead of Node 20 being removed from hosted runners on
  23 September 2026.

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
