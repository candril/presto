---
title: CLI
description: presto's flags. There are three.
---

Everything is the TUI. The command line is deliberately thin.

## `presto`

Open the list. Repositories come from `config.toml`; without one, the repository in the
current directory. Tabs, the filter, column visibility and the last PR list are restored from
the previous session.

```sh
presto
```

### `--demo`

Run against the built-in demo: a fictional org with three repos and a couple of dozen PRs that
cover every status glyph and every merge verdict. No `gh`, no network, no config, and nothing
written to `~/.config/presto` — state goes to a scratch directory that is wiped on each launch.
Actions work and are forgotten on exit.

```sh
presto --demo
```

Good for trying the keys, for working on presto itself, and for the docs screenshots.

### `--version`, `-v`

```sh
presto --version
```

### `--help`, `-h`

## Environment

`PRESTO_CONFIG_DIR` moves the config directory; `--demo` sets it to `$TMPDIR/presto-demo`
unless it is already set.
