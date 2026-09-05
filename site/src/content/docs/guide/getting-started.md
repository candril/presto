---
title: Getting Started
description: From the current repo to every repo you care about, and what the columns are telling you.
---

## 1. Watch some repos

Create `~/.config/presto/config.toml` (presto writes a commented one on first launch) and list
the repositories:

```toml
[[repositories]]
name = "polaris/api"

[[repositories]]
name = "polaris/web"
alias = "web"

[[repositories]]
name = "polaris/infra"
starred_only = true      # only PRs from authors you have starred (s)

[[repositories]]
name = "polaris/legacy"
disabled = true          # fetched only when you filter with repo:legacy
```

Launch `presto`. Every open PR from every enabled repo appears in one list, most recent
activity first. The list is cached, so the second launch is instant and refreshes behind it.

## 2. Read a row

```text
S C R B M  #    Title                                   Author   Repo
○ ✓ ✓ ✓ ✓  -    Rate-limit the search endpoint (#482)   @ines    api
○ ✓ - ✓ !  3    Retry transient S3 errors (#475)        @kai     api
○ ✓ ✓ ↓ !  -    Expose the audit log over GraphQL (#458) @arjun  api
○ ✓ ? ✓ ?  -    Migrate sessions table (#479)           @mara    api
```

The first four columns are the gates — **S**tate, **C**hecks, **R**eview, **B**ase — and the
fifth is the **M**erge verdict: whose move it is. `✓` nobody's, merge it. `!` the author's:
open comment threads, a red build, conflicts, behind its base. `?` someone else's, usually a
review. `·` a machine's — CI is running. `⇢` auto-merge is armed.

By default the list shows only **S** and **M**; press `c` to expand the gates. The full
vocabulary is on [Status Columns](/presto/reference/status-columns/), and `?` shows the legend
in the app.

## 3. Look closer

`j` / `k` move, `p` opens the preview: the same five columns spelled out, then comments,
reviews, the description, files and commits. `P` moves the panel to the bottom, `^D` / `^U`
scroll it.

`↵` opens the PR in [riff](https://github.com/candril/riff), `o` in the browser, `⇧D` pipes the
diff through `delta` (or `bat`, or `less`), `space` checks the branch out locally, `x` opens the
failing check.

## 4. Narrow it

`/` opens the filter. It applies as you type:

```text
/ @me                    your PRs
/ repo:api state:draft   drafts in one repo
/ -@renovate[bot]        hide the bot
/ >unread                what changed since you looked
/ https://github.com/polaris/api/pull/482   one PR, fetched if it is not loaded
```

## 5. Keep it as a tab

The filters you type every day should not be typed every day. `t` opens a new tab — a copy of
the current one — and `/` gives it a filter; the tab is named after it:

```text
t / @me ↵            My PRs
t / >unread ↵        Unread
t ⌫ / repo:infra ↵   infra
```

`1` `2` `3` switch, `[` `]` cycle, `d` closes, `u` brings one back. Every tab filters the same
refreshed list, so they cost nothing, and they are all there again on the next launch. A dot
on a tab means a PR in it changed since you looked. See [Tabs](/presto/reference/tabs/).

## 6. Act

`^P` opens the command palette with every action for the selected PR. Merge, submit a review,
arm auto-merge, update the branch from base, re-run the failed checks, trigger a workflow, mark
ready or draft, close — each with the confirmation GitHub itself would ask for. See
[Actions](/presto/reference/actions/).

## 7. Come back later

presto refreshes every five minutes and whenever the terminal regains focus. Each refresh is
diffed against the last one: a new push, new comments, an approval, a merge. Changed PRs get a
dot and a toast, `>unread` lists them, `v` marks one as read. With
`notifications.desktop = true` you also get a system notification.
