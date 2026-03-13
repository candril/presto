# Multi-Repository Support

**Status**: Done

## Description

Watch and aggregate pull requests across multiple repositories. Support organization-wide discovery, team repos, and personal projects in a unified view.

## Out of Scope

- Cross-organization aggregation (stick to one GitHub account)
- GitLab/Bitbucket support
- Repository management (add/remove via config file)

## Capabilities

### P1 - Must Have

- **Multiple repos**: Fetch PRs from configured repositories
- **Repo indicator**: Show which repo each PR belongs to
- **Merged view**: Single list with all PRs combined
- **Fallback to current**: Use current repo if none configured

### P2 - Should Have

- **Repo filter**: Filter list by repository
- **Parallel fetching**: Fetch from all repos concurrently
- **Repo aliases**: Short names for repos (e.g., "main" instead of "company/main-app")
- **Organization support**: Watch all repos in an org

### P3 - Nice to Have

- **Repo grouping**: Group PRs by repository in list
- **Per-repo counts**: Show PR count per repo in status bar
- **Repo quick switch**: Hotkeys to filter to specific repo

## Technical Notes

### Config Structure

```toml
# From spec 006
[[repositories]]
name = "mycompany/api"
alias = "api"

[[repositories]]
name = "mycompany/web"
alias = "web"

[[repositories]]
name = "mycompany/mobile"
alias = "mobile"

# Watch entire org (P2)
[organizations]
names = ["mycompany"]
exclude = ["mycompany/archived-repo"]
```

### Multi-Repo Fetching

```typescript
// src/providers/github.ts
import { $ } from "bun"
import type { PR } from "../types"
import type { Repository } from "../config/schema"

export async function listPRsFromRepos(repos: Repository[]): Promise<PR[]> {
  // Fetch from all repos in parallel
  const results = await Promise.allSettled(
    repos.map(repo => listPRsFromRepo(repo.name))
  )
  
  // Aggregate successful results
  const allPRs: PR[] = []
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPRs.push(...result.value)
    }
  }
  
  // Sort by updatedAt (most recent first)
  return allPRs.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

async function listPRsFromRepo(repo: string): Promise<PR[]> {
  const fields = "number,title,author,repository,state,isDraft,createdAt,updatedAt,reviewDecision,statusCheckRollup"
  const result = await $`gh pr list -R ${repo} --json ${fields}`.json()
  return result
}

export async function getCurrentRepo(): Promise<string | null> {
  try {
    const result = await $`gh repo view --json nameWithOwner -q .nameWithOwner`.text()
    return result.trim()
  } catch {
    return null
  }
}

export async function listOrgRepos(org: string): Promise<string[]> {
  const result = await $`gh repo list ${org} --json nameWithOwner -q '.[].nameWithOwner' --limit 100`.text()
  return result.trim().split("\n").filter(Boolean)
}
```

### State Updates

```typescript
// src/state.ts
export interface AppState {
  // ... existing
  repositories: string[]          // Active repo list
  repoFilter: string | null       // Filter to specific repo
  repoAliases: Map<string, string> // Full name -> alias
  fetchErrors: Map<string, string> // Repo -> error message
}

export type AppAction =
  // ... existing
  | { type: "SET_REPO_FILTER"; repo: string | null }
  | { type: "SET_FETCH_ERROR"; repo: string; error: string }
  | { type: "CLEAR_FETCH_ERRORS" }
```

### PR List with Repo Display

```tsx
// Updated PRRow in PRList.tsx
function PRRow({ pr, selected, alias }: { pr: PR; selected: boolean; alias?: string }) {
  const repoDisplay = alias || pr.repository.nameWithOwner.split("/")[1]
  
  return (
    <box height={1} width="100%" backgroundColor={selected ? theme.headerBg : undefined}>
      <text>
        <span fg={theme.textMuted}>[{repoDisplay}]</span>
        {" "}
        <span fg={stateColor}>{pr.isDraft ? "D" : pr.state[0]}</span>
        {" "}
        <span fg={theme.textDim}>#{pr.number}</span>
        {" "}
        <span fg={theme.text}>{pr.title}</span>
      </text>
    </box>
  )
}
```

### Repo Filter UI

```tsx
// src/components/RepoFilter.tsx
import { theme } from "../theme"

interface RepoFilterProps {
  repos: string[]
  aliases: Map<string, string>
  selected: string | null
  onSelect: (repo: string | null) => void
}

export function RepoFilter({ repos, aliases, selected, onSelect }: RepoFilterProps) {
  return (
    <box height={1} flexDirection="row" gap={2} paddingLeft={1}>
      <text 
        fg={selected === null ? theme.primary : theme.textDim}
        onClick={() => onSelect(null)}
      >
        All
      </text>
      {repos.map(repo => {
        const display = aliases.get(repo) || repo.split("/")[1]
        return (
          <text
            key={repo}
            fg={selected === repo ? theme.primary : theme.textDim}
            onClick={() => onSelect(repo)}
          >
            {display}
          </text>
        )
      })}
    </box>
  )
}
```

### Loading States

```typescript
// Show per-repo loading states
interface RepoLoadingState {
  repo: string
  loading: boolean
  error: string | null
  prCount: number
}

// Display in status bar
function buildStatusText(states: RepoLoadingState[]): string {
  const loading = states.filter(s => s.loading)
  if (loading.length > 0) {
    return `Loading ${loading.map(s => s.repo.split("/")[1]).join(", ")}...`
  }
  
  const errors = states.filter(s => s.error)
  if (errors.length > 0) {
    return `Errors: ${errors.length} repos`
  }
  
  const total = states.reduce((sum, s) => sum + s.prCount, 0)
  return `${total} PRs across ${states.length} repos`
}
```

## File Structure

```
src/
├── providers/
│   └── github.ts              # Add multi-repo fetching
├── components/
│   └── RepoFilter.tsx         # Repo filter bar
├── hooks/
│   └── useMultiRepoFetch.ts   # Parallel fetch hook
└── state.ts                   # Add repo state
```
