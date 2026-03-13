# Starred Authors Filter

**Status**: Draft

## Description

Allow repositories to be configured to only show PRs from starred authors by default. This reduces noise in busy repos where you only care about specific people's PRs. The filter is bypassed when explicitly searching for that repo or using other filters.

## Out of Scope

- Per-repo starred author lists (use global starred authors)
- Automatic starring based on interactions
- Team-based filtering (use GitHub teams in search)

## Capabilities

### P1 - Must Have

- **Config option**: `starredOnly = true` on repository config
- **Default filtering**: Repos with `starredOnly` only show PRs from starred authors
- **Bypass on explicit search**: When user types `repo:name`, show all PRs regardless of `starredOnly`
- **Visual indicator**: Show indicator in UI when starred-only filter is active

### P2 - Should Have

- **Quick toggle**: Keyboard shortcut to temporarily show all PRs in starred-only repos
- **Per-repo override**: Show count of hidden PRs ("12 more from non-starred authors")
- **Bypass on author search**: `@author` search shows that author even if not starred

### P3 - Nice to Have

- **Auto-suggest starring**: When viewing PRs from non-starred author in starred-only repo, suggest starring
- **Starred-only indicator in list**: Dim or hide indicator showing which repos are filtered

## Technical Notes

### Config Schema Update

```typescript
// src/config/schema.ts
export interface Repository {
  /** Full repo name: "owner/repo" */
  name: string
  /** Optional short display name */
  alias?: string
  /** Only show PRs from starred authors (default: false) */
  starredOnly?: boolean
}
```

### Config Example

```toml
# ~/.config/presto/config.toml

[[repositories]]
name = "DigitecGalaxus/large-monorepo"
starredOnly = true  # Only show PRs from people I've starred

[[repositories]]
name = "DigitecGalaxus/my-team-repo"
# starredOnly defaults to false - show all PRs
```

### Filter Logic Update

```typescript
// src/discovery/parser.ts or new file

interface FilterContext {
  starredAuthors: string[]
  repoConfig: Map<string, Repository>
  explicitRepoFilter: boolean  // true if user typed repo:X
  explicitAuthorFilter: boolean  // true if user typed @X
}

export function applyStarredOnlyFilter(
  prs: PR[],
  filter: ParsedFilter,
  context: FilterContext
): PR[] {
  // If explicit repo or author filter, bypass starred-only
  if (context.explicitRepoFilter || context.explicitAuthorFilter) {
    return prs
  }

  return prs.filter((pr) => {
    const repoName = getRepoName(pr)
    const repoConf = context.repoConfig.get(repoName)
    
    // If repo doesn't have starredOnly, show all
    if (!repoConf?.starredOnly) {
      return true
    }
    
    // For starredOnly repos, only show starred authors
    return context.starredAuthors.includes(pr.author.login)
  })
}
```

### Integration in App.tsx

```typescript
// After applying regular filter, apply starred-only filter
const filteredPRs = useMemo(() => {
  const afterFilter = applyFilter(state.prs, filter)
  
  // Build repo config map
  const repoConfig = new Map(
    config.repositories.map(r => [r.name, r])
  )
  
  // Check if explicit filters are being used
  const explicitRepoFilter = filter.repos.length > 0
  const explicitAuthorFilter = filter.authors.length > 0
  
  return applyStarredOnlyFilter(afterFilter, filter, {
    starredAuthors: history.starredAuthors,
    repoConfig,
    explicitRepoFilter,
    explicitAuthorFilter,
  })
}, [state.prs, filter, config.repositories, history.starredAuthors])
```

### UI Indicator

When starred-only is active, show in header or status bar:

```tsx
// In Header or StatusBar
{hasStarredOnlyRepos && !explicitFilter && (
  <text fg={theme.warning}>
    [starred only]
  </text>
)}
```

## File Structure

```
src/
├── config/
│   └── schema.ts          # Add starredOnly to Repository
├── discovery/
│   ├── parser.ts          # Existing filter logic
│   └── starredFilter.ts   # New: starred-only filtering
└── App.tsx                # Integrate starred-only filter
```
