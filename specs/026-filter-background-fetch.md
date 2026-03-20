# Filter-Aware Background Fetch

**Status**: In Progress

## Description

When a user applies filters in the discovery bar that narrow results to a subset the in-memory data can't fully satisfy (e.g. `state:merged`, `state:closed`, `@user`), trigger a targeted background fetch from the GitHub API to load additional matching PRs. This ensures users see comprehensive results even though the default fetch only loads 50 open PRs per repo.

Currently, `state:closed` and `state:merged` already trigger on-demand fetches, but they're limited to 50 PRs per repo with no pagination. Author filters (`@user`) have no background fetch at all — they only filter in-memory. This spec expands and unifies background fetching across all filter types that could benefit from server-side search.

Additionally, marked PRs from configured repos that have been closed/merged are currently only fetched on-demand when the `>marked` filter is activated (via `fetchMissingPRs` in `useFiltering`). This creates an unnecessary delay and a fragile code path. Marked PRs should always be available.

## Out of Scope

- Full GitHub Search API syntax (complex boolean queries)
- Changing the default fetch limits for the initial load (keep startup fast)
- Infinite scroll / automatic pagination without user action
- Caching fetched filter results across app restarts

## Capabilities

### P1 - Must Have

- **Always-loaded marked PRs**: Marked PRs should always be fetched during the normal refresh cycle, not just when `>marked` is active
  - `getTrackedPRsFromNonConfiguredRepos()` currently skips configured repos (it only fetches marked PRs from _non_-configured repos). But marked PRs from configured repos that are closed/merged are NOT in the initial open-only fetch either — they silently go missing until `>marked` triggers `fetchMissingPRs`
  - Fix: during every refresh in `usePRData.fetchPRs()`, also fetch any marked PRs that aren't already in the loaded set (regardless of which repo they're from)
  - This makes `fetchMissingPRs` for `>marked` in `useFiltering` redundant — remove it (or keep as a safety net but it should never trigger)
  - Same approach for `recentlyViewed` PRs from configured repos that may have been closed/merged

- **Author-filtered background fetch**: When `@user` filter is active, trigger a background `gh pr list --author <user>` across configured repos to find PRs not in the initial 50-per-repo load
  - Use `gh pr list --author <user> --state all --limit 50` per repo
  - Merge results via `APPEND_PRS` (existing dedup + sort)
  - Show refreshing indicator while loading
  - Track fetched author+repo combos to avoid re-fetching
  - Also works for `@me` (resolved to current username)

- **Expanded closed/merged fetch**: Increase the fetch for `state:closed` and `state:merged` filters
  - Use GitHub search qualifiers for more targeted results: `gh pr list --state closed --search "updated:>=<30d-ago>"` to get recent closed/merged PRs
  - When combined with `@user`, use `--author <user>` for more precise results
  - When combined with `repo:name`, only fetch from matching repos (already done)

- **Combined filter optimization**: When multiple filters are active (e.g. `@alice state:merged`), use the most specific API query possible
  - `@user + state:merged` → `gh pr list --author <user> --state merged`
  - `@user + state:closed` → `gh pr list --author <user> --state closed`
  - `@user + repo:name` → fetch only from matching repos with `--author`
  - Avoid redundant fetches when filter combinations are subsets of prior fetches

- **Fetch status feedback**: Show clear UI feedback during background fetches
  - Reuse existing refreshing indicator (spinner in header)
  - Show toast message: "Loading PRs for @user..." / "Loading merged PRs..."
  - On completion: "Found N additional PRs" (only if new PRs were added)

### P2 - Should Have

- **GraphQL search for author filter**: Use GitHub GraphQL search API instead of per-repo REST calls for author searches across all repos
  - Single query: `search(query: "author:<user> is:pr org:<org>", type: ISSUE, first: 50)`
  - Falls back to per-repo REST if GraphQL search fails
  - More efficient when user has many configured repos

- **Smart fetch threshold**: Only trigger background fetch when it's likely to help
  - For `@user`: fetch if in-memory count < 5 (suggests the author's PRs may not be in the top 50 per repo)
  - For `state:closed/merged`: always fetch (these are never in the initial load)
  - Don't re-fetch on every keystroke — debounce filter changes (300ms) before triggering background fetch

- **Pagination support**: Allow fetching more results beyond the initial background fetch limit
  - Track `hasMore` flag per filter+repo combination
  - Show "Load more results" option at bottom of PR list when more are available
  - Fetch next page on user action (Enter on "Load more" or a keybinding)
  - Cap at 200 total PRs per filter to prevent runaway fetches

### P3 - Nice to Have

- **Filter result caching**: Cache background fetch results in memory across filter changes within the same session
  - When user switches from `@alice` to `@bob` and back to `@alice`, don't re-fetch
  - Clear cache on manual refresh (R)
  - Use an LRU cache with max 10 filter combinations

- **Prefetch on suggestion hover**: When user navigates suggestions in discovery bar, prefetch data for the highlighted suggestion
  - Only prefetch author and state filters
  - Cancel prefetch if user moves past quickly (debounce 500ms)

- **Fetch progress**: Show per-repo fetch progress when loading from many repos
  - "Loading @alice: 3/8 repos..." with progress count
  - Progressively show results as each repo completes

## Technical Notes

### Fix: Always Fetch Marked PRs

Currently `getTrackedPRsFromNonConfiguredRepos()` in `usePRData.ts` (lines 31-54) collects marked + recently viewed PRs but **skips configured repos** (line 49: `if (enabledRepos.has(repo.toLowerCase())) continue`). The assumption is that configured repos are fully loaded — but they're only loaded for **open** PRs. A marked PR that has since been merged/closed in a configured repo silently disappears from `state.prs`.

The fix: add a new function `getTrackedPRsMissingFromLoadedSet()` that checks which marked (and optionally recent) PR keys are **not** in the currently loaded `state.prs`, regardless of which repo they're from, and fetches those via `getPRsBulk()` during the normal refresh cycle.

```typescript
// In usePRData.ts - called during fetchPRs() after main fetch completes

function getMissingTrackedPRs(
  loadedPRs: PR[],
  history: History
): Array<{ repo: string; number: number }> {
  const loadedKeys = new Set(
    loadedPRs.map(pr => `${getRepoName(pr)}#${pr.number}`)
  )
  
  const trackedKeys = new Set([
    ...(history.markedPRs ?? []),
    // optionally: ...(history.recentlyViewed ?? []).map(r => `${r.repo}#${r.number}`),
  ])
  
  const missing: Array<{ repo: string; number: number }> = []
  for (const key of trackedKeys) {
    if (loadedKeys.has(key)) continue
    const match = key.match(/^(.+)#(\d+)$/)
    if (!match) continue
    missing.push({ repo: match[1], number: parseInt(match[2], 10) })
  }
  return missing
}
```

After the main fetch completes (both the priority path and the all-at-once path in `fetchPRs()`), call:

```typescript
const missingTracked = getMissingTrackedPRs(allFetchedPRs, history)
if (missingTracked.length > 0) {
  const trackedPRs = await getPRsBulk(missingTracked)
  allFetchedPRs = [...allFetchedPRs, ...trackedPRs]
}
```

This makes the `fetchMissingPRs` logic for `>marked` in `useFiltering.ts` (lines 71-106, 160-168) redundant. It can be removed or kept as a no-op safety net.

### New Provider Functions

```typescript
// src/providers/github.ts

/**
 * List PRs by a specific author across states
 * Used for @user background fetch
 */
export async function listPRsByAuthor(
  repo: string,
  author: string, 
  state: "open" | "closed" | "merged" | "all" = "all"
): Promise<PR[]> {
  const args = [
    "pr", "list",
    "-R", repo,
    "--json", PR_FIELDS,
    "--limit", "50",
    "--author", author,
    "--state", state,
  ]
  const result = await $`gh ${args}`.json()
  return transformPRs(result as RawPR[])
}

/**
 * List recently closed/merged PRs (last 30 days)
 * More targeted than fetching all closed PRs
 */
export async function listRecentClosedPRs(
  repo: string,
  days: number = 30
): Promise<PR[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split("T")[0]
  
  const args = [
    "pr", "list",
    "-R", repo,
    "--json", PR_FIELDS,
    "--limit", "100",
    "--state", "closed",
    "--search", `updated:>=${sinceStr}`,
  ]
  try {
    const result = await $`gh ${args}`.json()
    return transformPRs(result as RawPR[])
  } catch {
    return []
  }
}
```

### Hook Changes

```typescript
// src/hooks/usePRData.ts - new/modified effect

// Track what we've already fetched to avoid re-fetching
const fetchedAuthorRepos = useRef<Map<string, Set<string>>>(new Map())

// Background fetch for @user filter
useEffect(() => {
  if (filter.authors.length === 0) return
  
  const author = filter.authors[0] // Primary author filter
  const enabledRepos = config.repositories
    .filter((r) => !r.disabled)
    .map((r) => r.name)
  
  // Determine repos to fetch (respect repo: filter if present)
  let reposToCheck = enabledRepos
  if (filter.repos.length > 0) {
    reposToCheck = enabledRepos.filter((repo) =>
      filter.repos.some((f) => repo.toLowerCase().includes(f))
    )
  }
  
  // Skip repos already fetched for this author
  const fetched = fetchedAuthorRepos.current.get(author) ?? new Set()
  const reposToFetch = reposToCheck.filter(r => !fetched.has(r.toLowerCase()))
  
  if (reposToFetch.length === 0) return
  
  // Determine what state to fetch
  const state = filter.states.includes("merged") ? "merged"
    : filter.states.includes("closed") ? "closed"
    : "all"
  
  dispatch({ type: "SET_REFRESHING", refreshing: true })
  dispatch({ type: "SHOW_MESSAGE", message: `Loading PRs for @${author}...` })
  
  Promise.all(
    reposToFetch.map(repo => 
      listPRsByAuthor(repo, author, state).catch(() => [])
    )
  ).then((results) => {
    // Mark repos as fetched for this author
    const newFetched = new Set(fetched)
    for (const repo of reposToFetch) {
      newFetched.add(repo.toLowerCase())
    }
    fetchedAuthorRepos.current.set(author, newFetched)
    
    const allPRs = results.flat()
    if (allPRs.length > 0) {
      dispatch({ type: "APPEND_PRS", prs: allPRs })
      dispatch({ type: "SHOW_MESSAGE", message: `Found ${allPRs.length} PRs by @${author}` })
    }
    dispatch({ type: "SET_REFRESHING", refreshing: false })
  })
}, [filter.authors.join(","), filter.repos.join(","), filter.states.join(",")])
```

### Improved Closed/Merged Fetch

The existing `useEffect` for `state:closed`/`state:merged` in `usePRData.ts` (lines 358-408) should be enhanced:

1. When combined with `@author`, use `listPRsByAuthor(repo, author, state)` instead of `listClosedPRs(repo)` — more targeted, faster results
2. Use `--search updated:>=<date>` to focus on recent PRs rather than fetching the oldest 50 closed PRs
3. The tracking refs (`fetchedClosedRepos`, `fetchedMergedRepos`) should include the author in the cache key when author filter is active

### Debouncing

Background fetches should be debounced to avoid firing on every keystroke:

```typescript
// Use a ref to track the debounce timer
const fetchDebounceRef = useRef<ReturnType<typeof setTimeout>>()

useEffect(() => {
  // Clear previous timer
  if (fetchDebounceRef.current) {
    clearTimeout(fetchDebounceRef.current)
  }
  
  // Debounce 300ms before triggering background fetch
  fetchDebounceRef.current = setTimeout(() => {
    triggerBackgroundFetch(filter)
  }, 300)
  
  return () => {
    if (fetchDebounceRef.current) {
      clearTimeout(fetchDebounceRef.current)
    }
  }
}, [filter])
```

### Data Flow

```
User types "@alice state:merged"
    |
    v
parseFilter() → { authors: ["alice"], states: ["merged"] }
    |
    v
In-memory filter applied instantly (0 results likely)
    |
    v (debounce 300ms)
Background fetch: gh pr list --author alice --state merged -R <repo> (per repo)
    |
    v
APPEND_PRS → merged into state.prs → re-filter → show results
    |
    v
Toast: "Found 12 PRs by @alice"
```

## File Structure

```
src/
├── providers/
│   └── github.ts             # Add listPRsByAuthor(), listRecentClosedPRs()
├── hooks/
│   ├── usePRData.ts          # Always fetch missing marked PRs during refresh,
│   │                         # add author background fetch effect,
│   │                         # enhance closed/merged fetch with author support
│   └── useFiltering.ts       # Remove fetchMissingPRs for >marked (now handled
│                              # by usePRData refresh cycle)
└── (no new files needed - this enhances existing infrastructure)
```
