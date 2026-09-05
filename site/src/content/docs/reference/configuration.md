---
title: Configuration
description: Every key in ~/.config/presto/config.toml.
---

presto reads one TOML file:

```text
~/.config/presto/config.toml        # or $PRESTO_CONFIG_DIR/config.toml
```

It is optional. Without it presto shows the PRs of the repository in the current directory.
On first launch it writes a commented default. Keys are `snake_case`; every key has a default.

## A complete example

```toml
[[repositories]]
name = "polaris/api"
local_path = "~/code/api"

[[repositories]]
name = "polaris/web"
alias = "web"

[[repositories]]
name = "polaris/infra"
starred_only = true

[[repositories]]
name = "polaris/legacy"
disabled = true

[paths]
base_path = "~/code"

[tools]
diff = "auto"

[refresh]
interval = 300
on_focus = true

[notifications]
desktop = false

[bot_patterns]
patterns = ["-ci$", "^polaris-release$"]

[keys]
"action.open" = "return"
"action.browser" = "o"
"ui.preview" = "p"
```

## `[[repositories]]`

One entry per repository to watch. With none, presto uses the current directory's repository.

| Key | Default | Meaning |
| --- | --- | --- |
| `name` | — | `owner/repo` |
| `alias` | — | short name for the tab title |
| `starred_only` | `false` | show only PRs by starred authors; `*` in the filter overrides |
| `disabled` | `false` | do not fetch by default — only when a filter names it with `repo:` |
| `local_path` | — | where the repo is cloned, for `space` (checkout) |

## `[paths]`

| Key | Default | Meaning |
| --- | --- | --- |
| `base_path` | — | a directory under which repos are cloned by their short name, e.g. `~/code` → `~/code/api` |

Checkout resolves the clone in this order: `local_path` on the repository, riff's
`storage.repos["owner/repo"]`, `paths.base_path/<name>`, riff's `storage.basePath/<name>`.
riff's config is read from `~/.config/riff/config.toml`, so if you use riff there is nothing to
set up.

## `[tools]`

| Key | Default | Meaning |
| --- | --- | --- |
| `diff` | `"auto"` | the pager `⇧D` pipes the diff into. `auto` picks `delta --paging=always`, then `bat -l diff --paging=always`, then `less -R`; any other string is run as given |

## `[refresh]`

| Key | Default | Meaning |
| --- | --- | --- |
| `interval` | `300` | seconds between refreshes; `0` disables |
| `on_focus` | `true` | refresh when the terminal (or tmux pane) regains focus |

The header shows the time of the last refresh, and `!` before it once the data is more than
twice the interval old.

## `[notifications]`

| Key | Default | Meaning |
| --- | --- | --- |
| `desktop` | `false` | send a system notification when a refresh finds changes |

## `[bot_patterns]`

| Key | Default | Meaning |
| --- | --- | --- |
| `patterns` | `[]` | extra regular expressions (matched against the login) that mark an account as a bot |

Bots are excluded from comment counts, review threads and approvals. `[bot]`, `dependabot`,
`renovate`, `codecov`, `github-actions` and the usual suspects are built in.

## `[keys]`

Override any binding. Keys are the action names from
[`src/keybindings/defaults.ts`](https://github.com/candril/presto/blob/main/src/keybindings/defaults.ts);
values are a key, an uppercase letter for shift, or `ctrl+` / `shift+` combinations.

```toml
[keys]
"nav.down" = "j"
"nav.up" = "k"
"action.open" = "return"       # Enter
"action.checkout" = "space"
"ui.commandPalette" = "ctrl+p"
"action.forceRefresh" = "R"    # shift+r
"action.repoBrowser" = "ctrl+o" # unbound by default
```

| Group | Actions |
| --- | --- |
| Navigation | `nav.down` `nav.up` `nav.top` `nav.bottom` `nav.pageDown` `nav.pageUp` |
| Actions | `action.open` `action.openTmux` `action.browser` `action.repoBrowser` `action.checkout` `action.copyNumber` `action.copyUrl` `action.copyBranch` `action.diff` `action.checks` `action.star` `action.mark` `action.toggleSeen` `action.refresh` `action.forceRefresh` |
| Filters | `filter.open` `filter.clear` `filter.marked` `filter.recent` `filter.starred` `filter.expanded` `filter.unread` |
| Tabs | `tab.new` `tab.close` `tab.undo` `tab.prev` `tab.next` `tab.1` … `tab.9` |
| UI | `ui.help` `ui.quit` `ui.preview` `ui.previewCycle` `ui.gateDetail` `ui.commandPalette` `ui.console` |

## Environment

| Variable | Meaning |
| --- | --- |
| `PRESTO_CONFIG_DIR` | where config, cache, history and tabs live (default `~/.config/presto`) |
| `TMUX` | set by tmux; `⇧O` needs it |
