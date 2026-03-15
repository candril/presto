# Visited Repositories Tracking

**Status**: Ready

## Description

Track repositories that users visit via PR opens (Enter/`o` keys). Visited repos that aren't in the config appear as "disabled" repositories in the `repo:` filter suggestions, allowing users to quickly access PRs from repos they've encountered but haven't configured.

This creates a seamless discovery flow: open a PR from a new repo → that repo becomes available for filtering even if not in config.

## Out of Scope

- Auto-adding visited repos to config (manual config remains authoritative)
- Syncing visited repos across machines
- Configurable limit on visited repos (hardcoded)
- Fetching PRs from visited repos on startup (only when explicitly filtered)

## Capabilities

### P1 - Must Have

- **Track on PR open**: Record repository when opening any PR via:
  - Enter key (opens in riff)
  - `o` key (opens in browser)
- **Visited repos in suggestions**: Show visited repos in `repo:` completions alongside configured repos (no visual distinction needed)
- **Disabled behavior**: Visited repos behave like `disabled: true` config repos:
  - Not fetched by default
  - Only load PRs when explicitly filtered with `repo:<name>`
- **Persistence**: Store in `history.json` alongside other history

### P2 - Should Have

- **Recent first**: Sort all repos by recency of visit (most recent first)
- **Merge with config**: If a visited repo is later added to config, config takes precedence

### P2 - Should Have

- **Forget repo**: Command palette action "Forget repo" removes current PR's repo from visited repos
  - Only shows when PR is from a visited (non-configured) repo
  - Removes repo from suggestions

### P3 - Nice to Have

- **Clear all visited repos**: Command to clear entire visited repo history
- **Age out**: Auto-remove repos not visited in 30+ days

## Technical Notes

### History Schema Addition

```typescript
// src/history/schema.ts

/** A visited repository (not in config) */
export interface VisitedRepo {
  /** Full repo name: "owner/repo" */
  name: string
  /** When first visited */
  firstVisit: string // ISO date
  /** When last visited */
  lastVisit: string // ISO date
  /** Number of PR opens from this repo */
  visitCount: number
}

export interface History {
  // ... existing fields
  
  /** Repositories visited via PR opens (not in config) */
  visitedRepos: VisitedRepo[]
}

export const HISTORY_LIMITS = {
  // ... existing
  visitedRepos: 50,  // Keep last 50 visited repos
}

export const defaultHistory: History = {
  // ... existing
  visitedRepos: [],
}
```

### Recording Visits

```typescript
// src/history/loader.ts

/** Record a visit to a repository */
export function recordRepoVisit(history: History, repoName: string): History {
  const now = new Date().toISOString()
  
  const existing = history.visitedRepos.find(r => r.name === repoName)
  
  let visitedRepos: VisitedRepo[]
  if (existing) {
    // Update existing - move to front
    visitedRepos = [
      { ...existing, lastVisit: now, visitCount: existing.visitCount + 1 },
      ...history.visitedRepos.filter(r => r.name !== repoName),
    ]
  } else {
    // Add new
    visitedRepos = [
      { name: repoName, firstVisit: now, lastVisit: now, visitCount: 1 },
      ...history.visitedRepos,
    ]
  }
  
  return { ...history, visitedRepos }
}

/** Get visited repos not in config */
export function getVisitedReposNotInConfig(
  history: History,
  configRepos: Repository[]
): VisitedRepo[] {
  const configNames = new Set(configRepos.map(r => r.name))
  return history.visitedRepos.filter(r => !configNames.has(r.name))
}
```

### Integration with PR Open

```typescript
// src/hooks/useKeyboardNav.ts

// Open in browser
if (key.name === "o") {
  const repo = getRepoName(selectedPR)
  
  // Record PR view (existing)
  let newHistory = recordPRView(history, {
    repo,
    number: selectedPR.number,
    title: selectedPR.title,
    author: selectedPR.author.login,
  })
  
  // Record repo visit (new)
  newHistory = recordRepoVisit(newHistory, repo)
  
  setHistory(newHistory)
  saveHistory(newHistory)
  
  // ... rest of open logic
}

// Same for Enter key (riff)
```

### Suggestions Update

```typescript
// src/components/DiscoverySuggestions.tsx

function buildSuggestions(
  query: string,
  history: History,
  prs: PR[],
  repositories: Repository[]
): Suggestion[] {
  // ... existing logic
  
  // When showing repos, combine configured + visited (no visual distinction)
  // Sort by: repos with PRs first (by count), then visited repos (by recency)
  
  if (isTypingRepo) {
    const partial = lastToken.slice(5)
    
    // ... existing configured repo logic ...
    
    // Add visited repos not in config (same appearance as configured disabled repos)
    const visitedNotConfigured = getVisitedReposNotInConfig(history, repositories)
    for (const repo of visitedNotConfigured) {
      const shortName = repo.name.split("/")[1] || repo.name
      if (
        repo.name.toLowerCase().includes(partial) ||
        shortName.toLowerCase().includes(partial)
      ) {
        items.push({
          type: "repo",
          value: `${prefixWithSpace}repo:${repo.name}`,
          label: repo.name,  // No special marker
        })
      }
    }
  }
}
```

### Filtering Integration

Visited repos behave like disabled repos - when filtered with `repo:`, the system fetches PRs from that repo on-demand. This already works via the existing disabled repo logic in `usePRData`.

## File Structure

```
src/
├── history/
│   ├── schema.ts          # Add VisitedRepo, visitedRepos field
│   └── loader.ts          # Add recordRepoVisit, getVisitedReposNotInConfig
├── hooks/
│   └── useKeyboardNav.ts  # Record repo visit on PR open
└── components/
    └── DiscoverySuggestions.tsx  # Show visited repos in suggestions
```

## UI Examples

### Repo Suggestions (typing "repo:")

```
/ repo:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/  owner/main-repo              (12)
/  owner/other-repo             (3)
/  someone/random-repo                   ← visited, shows up naturally
/  another/project
```

Repos with loaded PRs show counts. Others don't - user doesn't need to know why.

## Interaction Flow

1. User sees a PR from `owner/new-repo` (via @marked, @recent, or search)
2. User presses Enter to open it in riff
3. `owner/new-repo` is recorded in `visitedRepos`
4. Next time user types `repo:`, they see `owner/new-repo` in suggestions
5. Selecting it fetches and shows PRs from that repo
