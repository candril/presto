# Open Comment Counts

**Status**: Done

## Description

The comment count in the PR list counts every comment ever written, so a PR whose
review threads are all resolved still reads as loud as one with a dozen open questions.
Split the count in two: the list shows only comments that are still open (not inside a
resolved review thread), and the preview panel shows `open/total`.

## Out of Scope

- Rendering resolved threads or their comments in the preview conversation section
- Per-thread grouping of comments
- Marking threads resolved from presto

## Capabilities

### P1 - Must Have

- **Open count in list**: The `#` column shows only comments still waiting on someone —
  a PR with 12 comments of which 10 are settled reads as `2`
- **Settled/total in preview**: The preview `Comments` row shows `10/12`
- **Thread comments counted**: Review-thread comments join PR-level comments and review
  bodies in the total; today they are counted only as *threads*, never as comments

### P2 - Should Have

- **Bot threads excluded**: A thread opened by a bot is dropped whole, matching how
  `unresolvedThreads` already discounts bots (spec 024)
- **Fallback path degrades cleanly**: `gh pr list` exposes no review threads, so on that
  path the open count is zero rather than a number invented from the total

## Definitions

```
total = human PR comments + human review bodies + comments in human review threads
open  = comments in unresolved human review threads
```

Only review threads can be resolved. A conversation comment or a review body has no
resolved state on GitHub and needs no answer once read, so counting those as open would
just restate the total — which is the complaint this spec exists to fix.

## Technical Notes

### GraphQL

`reviewThreads` already comes back for the unresolved-thread count; it needs the thread's
comment total as well, and the window widens to 50 so long-running PRs are not truncated:

```graphql
reviewThreads(first: 50) {
  nodes {
    isResolved
    comments(first: 1) { totalCount nodes { author { login __typename } } }
  }
}
```

The counting lives in one exported pure function so both counts and the thread count are
derived from the same filtered thread list.

### Notification side effect

`commentCount` feeds change detection (spec 016), so widening it to include thread
comments makes the first refresh after this change report the difference as new comments,
once, for PRs with inline review comments. Inline comments genuinely being new activity,
this is the right steady state; the one-off burst is the cost of getting there.

### Display

- List: `#` column shows open only — a review whose threads are all resolved stops
  shouting, and a PR with nothing but conversation shows `-`
- Preview: `Comments  10/12` — settled out of total, so the remainder is what the list
  column shows; the `· N unresolved threads` suffix stays, since threads and comments are
  different units

## File Structure

- `src/types.ts` — add `openCommentCount` to `PR`, default it in `normalizePR`
- `src/providers/graphql.ts` — thread comment totals, exported count helper
- `src/providers/github.ts` — fallback path sets open = total
- `src/components/PRList.tsx` — render open count
- `src/components/PreviewPanel.tsx` — render `open/total`
- `src/providers/graphql.test.ts` — counting tests
