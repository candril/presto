---
title: Installation
description: Install presto, point it at your repos, and run it.
---

## Install

Prebuilt binaries for macOS (Apple Silicon and Intel) and Linux (x64 and arm64), by any of three
routes. All three install the same binary: the one attached to the latest
[release](https://github.com/candril/presto/releases), verified against its `SHA256SUMS`.

### Homebrew

```sh
brew install candril/tap/presto
```

The tap is [candril/homebrew-tap](https://github.com/candril/homebrew-tap); `brew upgrade` picks
up new releases.

### Nix

```sh
nix run github:candril/presto                 # run it once
nix profile install github:candril/presto     # keep it
```

Or as a flake input — `inputs.presto.url = "github:candril/presto"`, then
`inputs.presto.packages.${system}.default`. The flake packages the release binary; the release
workflow writes its `release.json`, so `nix run` and `nix flake update` land on the newest release.

The package wraps `gh` and `git` onto the binary's `PATH`, so nothing else is needed.

### Installer script

```sh
curl -fsSL https://raw.githubusercontent.com/candril/presto/main/scripts/install.sh | bash
```

The installer detects your platform, downloads the latest release, verifies its SHA256 against the
release's `SHA256SUMS`, and puts `presto` in `/usr/local/bin`. Two variables change that:

```sh
PRESTO_INSTALL_DIR=~/.local/bin …   # somewhere else on your PATH
PRESTO_VERSION=0.1.0 …              # a specific release
```

Or download `presto-<os>-<arch>.gz` from the releases page by hand, `gunzip` it, and put it on
your `PATH`.

### From source

presto is a [Bun](https://bun.sh) application, so a clone runs as it is:

```sh
git clone https://github.com/candril/presto.git
cd presto
bun install
bun src/index.tsx          # run from source
bun scripts/build.ts       # → dist/presto, a standalone binary
```

With [just](https://github.com/casey/just): `just run`, `just dev` for hot reload, `just build`
for the binary, `just demo` for the demo.

## Requirements

- The [GitHub CLI](https://cli.github.com), logged in: `gh auth status` should be green.
  presto uses its token for the GraphQL API and shells out to it for everything else.
- A terminal with truecolor and a decent Unicode set — anything modern (WezTerm, Ghostty,
  kitty, iTerm2, Alacritty) is fine.
- [Bun](https://bun.sh) 1.x, only if you build from source.
- Optional: [riff](https://github.com/candril/riff) for `↵`, a diff pager such as `delta` or
  `bat` for `⇧D`, and tmux for `⇧O`.

## Try it first

```sh
presto --demo
```

opens an offline demo — a fictional org with three repos and a couple of dozen PRs that cover
every status glyph and every merge verdict — so you can learn the keys before pointing it at
anything real. Actions work and are forgotten on exit. Press `?` for the shortcut dialog, `q`
to quit.

## First run

Without a config, presto shows the pull requests of the repository in the current directory
(whatever `gh repo view` resolves). To watch several repos, write a config — start from
[Getting Started](/presto/guide/getting-started/).

## Files presto writes

| Path | What |
| --- | --- |
| `~/.config/presto/config.toml` | Your config. presto writes a commented default once, then only reads it. |
| `~/.config/presto/cache.json` | The last PR list, so the next launch shows it at once and refreshes behind it. Also column visibility. |
| `~/.config/presto/history.json` | Starred authors, marks, recently viewed PRs, and the per-PR snapshots that change detection compares against. |
| `~/.config/presto/tabs.json` | Your tabs. |

`PRESTO_CONFIG_DIR` moves the whole directory. The cache and tabs are best-effort: deleting them
costs one refresh and your tabs. Deleting `history.json` loses your marks and stars.
