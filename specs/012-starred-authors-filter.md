# Starred Authors Filter

**Status**: Done

## Description

Allow repositories to be configured to only show PRs from starred authors by default. This reduces noise in busy repos (like isomorph monorepo) where you only care about specific people's PRs. The filter can be bypassed:
1. When explicitly searching for that repo (`repo:name`)
2. When searching for a specific author (`@author`)
3. When using the "show all" modifier (`*`) to see all PRs

## Out of Scope

- Per-repo starred author lists (use global starred authors)
- Automatic starring based on interactions
- Team-based filtering (use GitHub teams in search)

## Capabilities

### P1 - Must Have

- **Config option**: `starredOnly = true` on repository config
- **Default filtering**: Repos with `starredOnly` only show PRs from starred authors
- **Show all modifier**: Typing `*` in discovery shows ALL PRs, bypassing starred-only filter
- **Bypass on explicit search**: `repo:name` or `@author` shows all PRs regardless of `starredOnly`
- **Visual indicator**: Show indicator in UI when starred-only filter is active

### P2 - Should Have

- **Quick toggle**: Keyboard shortcut (e.g., `*`) to toggle show-all mode without opening discovery
- **Hidden PR count**: Show count of hidden PRs ("12 more from non-starred authors")
- **Combine with other filters**: `* ci-fix` shows all PRs matching "ci-fix" including non-starred authors

### P3 - Nice to Have

- **Auto-suggest starring**: When viewing PRs from non-starred author in starred-only repo, suggest starring
- **Starred-only indicator in list**: Dim or visual indicator showing which repos are filtered

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
name = "DigitecGalaxus/isomorph"
starredOnly = true  # Only show PRs from people I've starred

[[repositories]]
name = "DigitecGalaxus/my-team-repo"
# starredOnly defaults to false - show all PRs
```

### Filter Parsing Update

```typescript
// src/discovery/parser.ts

export interface ParsedFilter {
  authors: string[]      // @username entries
  repos: string[]        // repo:name entries
  states: string[]       // state:open entries
  text: string           // Remaining text for title search
  showAll: boolean       // * modifier - bypass starred-only filter
}

export function parseFilter(query: string): ParsedFilter {
  const result: ParsedFilter = {
    authors: [],
    repos: [],
    states: [],
    text: "",
    showAll: false,
  }

  const tokens = query.split(/\s+/).filter(Boolean)
  const textParts: string[] = []

  for (const token of tokens) {
    if (token === "*") {
      result.showAll = true
    } else if (token.startsWith("@")) {
      result.authors.push(token.slice(1).toLowerCase())
    } else if (token.startsWith("repo:")) {
      result.repos.push(token.slice(5).toLowerCase())
    } else if (token.startsWith("state:")) {
      result.states.push(token.slice(6).toLowerCase())
    } else {
      textParts.push(token)
    }
  }

  result.text = textParts.join(" ").toLowerCase()
  return result
}
```

### Starred-Only Filter Logic

```typescript
// src/discovery/starredFilter.ts

interface StarredFilterContext {
  starredAuthors: string[]
  repoConfig: Map<string, Repository>
}

export function applyStarredOnlyFilter(
  prs: PR[],
  filter: ParsedFilter,
  context: StarredFilterContext
): { filtered: PR[]; hiddenCount: number } {
  // Bypass conditions:
  // 1. showAll modifier (*)
  // 2. explicit repo filter (repo:X)
  // 3. explicit author filter (@X)
  const bypass = 
    filter.showAll || 
    filter.repos.length > 0 || 
    filter.authors.length > 0

  if (bypass) {
    return { filtered: prs, hiddenCount: 0 }
  }

  let hiddenCount = 0
  const filtered = prs.filter((pr) => {
    const repoName = getRepoName(pr)
    const repoConf = context.repoConfig.get(repoName)
    
    // If repo doesn't have starredOnly, show all
    if (!repoConf?.starredOnly) {
      return true
    }
    
    // For starredOnly repos, only show starred authors
    const isStarred = context.starredAuthors.includes(pr.author.login)
    if (!isStarred) {
      hiddenCount++
    }
    return isStarred
  })

  return { filtered, hiddenCount }
}
```

### Integration in App.tsx

```typescript
// After applying regular filter, apply starred-only filter
const { filteredPRs, hiddenCount } = useMemo(() => {
  const afterFilter = applyFilter(state.prs, filter)
  
  // Build repo config map
  const repoConfig = new Map(
    config.repositories.map(r => [r.name, r])
  )
  
  const result = applyStarredOnlyFilter(afterFilter, filter, {
    starredAuthors: history.starredAuthors,
    repoConfig,
  })
  
  return { filteredPRs: result.filtered, hiddenCount: result.hiddenCount }
}, [state.prs, filter, config.repositories, history.starredAuthors])
```

### UI Indicators

```tsx
// In Header - show starred-only indicator and hidden count
{hiddenCount > 0 && (
  <text fg={theme.textDim}>
    ★ +{hiddenCount} hidden
  </text>
)}

// In StatusBar - show hint about * to show all
{hiddenCount > 0 && (
  <text>*: show all</text>
)}
```

### Usage Examples

| Filter Query | Behavior |
|--------------|----------|
| (empty) | Default: isomorph shows only starred authors |
| `*` | Show ALL PRs including non-starred authors |
| `* feature` | Show all PRs matching "feature" |
| `@someuser` | Show someuser's PRs (even if not starred) |
| `repo:isomorph` | Show all isomorph PRs (explicit repo = bypass) |
| `ci-fix` | Search "ci-fix" in starred authors only |
| `* repo:isomorph ci-fix` | Search "ci-fix" in ALL isomorph PRs |

## File Structure

```
src/
├── config/
│   └── schema.ts          # Add starredOnly to Repository
├── discovery/
│   ├── parser.ts          # Add showAll to ParsedFilter
│   ├── starredFilter.ts   # New: starred-only filtering
│   └── index.ts           # Export new filter
└── App.tsx                # Integrate starred-only filter
```
