---
title: Key Bindings
description: The whole keymap. Press ? in the app for the same thing, without leaving the terminal.
---

presto is vim-flavoured: `j` `k` move, `g` `⇧G` jump, lowercase acts on the selected PR, and
`^P` lists everything else. Every binding here can be changed in
[`[keys]`](/presto/reference/configuration/#keys).

Press `?` at any time for this list in the app; `esc`, `?` or `q` closes it.

## Navigation

| Keys | Action |
| --- | --- |
| `j` / `k` (or `↓` / `↑`) | move down / up |
| `g` / `⇧G` | top / bottom |
| `^D` / `^U` | scroll the preview half a page down / up |
| `p` | toggle the preview panel |
| `⇧P` | move the preview: right → bottom → off |
| `c` | expand / collapse the gate columns (C R B) behind the merge verdict |

## Open

| Keys | Action |
| --- | --- |
| `↵` | open in [riff](https://github.com/candril/riff); presto refreshes when you come back |
| `⇧O` | open in riff in a new tmux window, presto keeps running |
| `o` | open in the browser |
| `⇧D` | pipe the diff through your diff viewer (`delta`, `bat`, or `less`) |
| `x` | open the failing check — one red check opens its job page, several open the checks tab, none opens the branch's workflow runs |
| `space` | `gh pr checkout` in the local clone |

## Copy

| Keys | Action |
| --- | --- |
| `y` | copy `#number` |
| `⇧Y` | copy the URL |
| `b` | copy the head branch name |

## Filter

| Keys | Action |
| --- | --- |
| `/` | open the filter prompt; `tab` autocompletes, `↵` applies, `esc` cancels |
| `⌫` | clear the filter (when one is active) |
| `^E` | toggle `@me` |
| `^U` | toggle `>unread` (when the preview is closed) |
| `^M` | toggle `>marked` |
| `^R` | toggle `>recent` |
| `^S` | toggle `>starred` |

## Marks, stars, unread

| Keys | Action |
| --- | --- |
| `m` then `a`–`z` | mark the PR with a letter (again to unmark) |
| `'` then `a`–`z` | filter to that letter; `''` clears |
| `s` | star / unstar the author |
| `v` | toggle read / unread |

## Tabs

| Keys | Action |
| --- | --- |
| `t` | new tab (a copy of the current one — change its filter) |
| `d` | close the tab |
| `u` | undo the last close |
| `[` / `]` | previous / next tab |
| `1`–`9` | switch to tab N |

## Everything else

| Keys | Action |
| --- | --- |
| `^P` | the command palette — every action, filter and column toggle, with a search box |
| `r` / `⇧R` | refresh |
| `?` | this list |
| `` ` `` | toggle the console (request log) |
| `q` | quit |

## In the palette

`^N` / `^P` (or `↓` / `↑`) move, `↵` runs, `esc` closes. Dangerous commands — close, re-run
checks — ask for a second `↵`. Dialogs (merge, review, workflow) have their own hints in the
footer: number keys pick an option, `^J` inserts a newline in a review body.
