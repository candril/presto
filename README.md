<p align="center">
  <img src="site/src/assets/logo.png" alt="presto" width="160" />
</p>

<h1 align="center">presto</h1>

<p align="center">Every open PR across the repos you watch, in one list — and, for each one, whose move it is.</p>

> [!CAUTION]
> presto is young, spec-first, and was largely written with an AI pair. It talks to GitHub through the [`gh`](https://cli.github.com) CLI and it *writes* — reviews, merges, auto-merge, branch updates, workflow runs. Try it on repos you don't mind poking at, and expect rough edges.

```sh
nix run github:candril/presto -- --demo    # the built-in demo — no GitHub, no config
```

<img src="site/src/assets/presto-demo.gif" alt="presto demo" width="100%" />

---

### One list, whose move it is

A row carries five glyphs: **S**tate, **C**hecks, **R**eview, **B**ase, **M**erge. The first four are the gates; the last is the verdict — `✓` merge it, `!` the author's move, `?` someone else's, `·` a machine's, `⇢` auto-merge will land it. Not *blocked / pending / ready*: measured across real repos, that split put 86 % of PRs in "blocked" and told you nothing.

<img src="site/src/assets/screenshots/list.png" alt="The list: state, checks, review, base and merge columns for every open PR across three repos" width="100%" />

### The preview spells it out

`p` opens the same five columns with their meaning written out — *Author's move — 2 open comment threads to resolve* — then comments, reviews, the description as Markdown, files and commits.

<img src="site/src/assets/screenshots/preview-author.png" alt="The preview panel explaining each status column, with comments and reviews" width="100%" />

### Act from the list

`^P` lists every action for the selected PR: review, merge, arm auto-merge, update the branch from base, re-run checks, trigger a workflow, checkout, open in riff or the browser. Rows update optimistically; a branch update shows `↻` until the next refresh proves it landed.

<img src="site/src/assets/screenshots/merge.png" alt="The merge dialog with the repo's allowed methods" width="100%" />

### Filter as you type, know what changed

`/` narrows the list live — `@me`, `repo:api`, `state:draft`, `>unread`, free text, or a pasted PR URL — and `t` makes it a tab. Every refresh is diffed against the last: changed PRs get a dot and a toast.

<img src="site/src/assets/screenshots/toast.png" alt="A refresh toast listing what changed, with unread dots on the rows" width="100%" />

## Install

```sh
nix run github:candril/presto          # or add github:candril/presto to your flake inputs
```

Or from source with [Bun](https://bun.sh): `git clone https://github.com/candril/presto.git && cd presto && bun install && bun src/index.tsx`. Needs the [GitHub CLI](https://cli.github.com), logged in.

## Setup

Without a config presto shows the PRs of the repo in the current directory. To watch several, list them in `~/.config/presto/config.toml`:

```toml
[[repositories]]
name = "polaris/api"

[[repositories]]
name = "polaris/web"
starred_only = true    # only PRs from authors you have starred (s)
```

Every key, the filter grammar, the column legend and the full keymap are in the
**[docs](https://candril.github.io/presto/)**. Press `?` in the app for the keymap.

## Development

```sh
just dev          # run from source with hot reload
just demo         # the offline demo
just test         # bun test
just typecheck
just shots        # regenerate the docs screenshots from the demo (tmux + Pillow)
just demo-gif     # regenerate the README gif
just site-dev     # the docs site, locally
```

Features are specified before they are built — see [`specs/`](./specs). The demo (`--demo`, [spec 042](./specs/042-demo-mode.md)) is also where every screenshot comes from ([`docs/screenshots.md`](./docs/screenshots.md)).

## License

MIT
