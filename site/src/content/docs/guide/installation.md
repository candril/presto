---
title: Installation
description: Install presto, point it at your repos, and run it.
---

## Install

### Nix

Run it without installing anything:

```sh
nix run github:candril/presto
```

Or add it to your flake inputs:

```nix
{
  inputs.presto.url = "github:candril/presto";

  # then, in your system or home-manager config:
  environment.systemPackages = [ inputs.presto.packages.${system}.default ];
}
```

The package wraps the binary with `gh` and `git` on its `PATH`, so nothing else is needed.

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
