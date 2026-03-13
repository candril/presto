# PR Detail

**Status**: Ready

## Description

Show detailed information about a selected pull request. Displays PR metadata, description, checks status, and review status in an expanded view.

## Out of Scope

- Full diff viewing (use riff for that)
- Commenting on PRs (use browser/riff)
- Approving/requesting changes

## Capabilities

### P1 - Must Have

- **Toggle detail view**: Enter to expand, Escape to collapse
- **PR metadata**: Title, number, repo, author, branch info
- **Description**: PR body/description text
- **Status summary**: Open/closed/merged, draft status

### P2 - Should Have

- **Checks list**: All CI checks with pass/fail/pending status
- **Review status**: List of reviewers and their decisions
- **Labels**: Display PR labels with colors
- **Scrollable content**: Scroll through long descriptions

### P3 - Nice to Have

- **Comments preview**: Show recent comments
- **Files changed**: List of modified files
- **Split pane**: List on left, detail on right

## Technical Notes

### Fetch PR Details

```typescript
// src/providers/github.ts
export interface PRDetail extends PR {
  body: string
  headRefName: string
  baseRefName: string
  labels: { name: string; color: string }[]
  reviewRequests: { login: string }[]
  latestReviews: {
    author: { login: string }
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING"
  }[]
  statusCheckRollup: {
    contexts: {
      name: string
      state: string
      conclusion: string
    }[]
  }
}

export async function getPRDetail(repo: string, number: number): Promise<PRDetail> {
  const result = await $`gh pr view ${number} -R ${repo} --json number,title,author,body,headRefName,baseRefName,labels,reviewRequests,latestReviews,statusCheckRollup,state,isDraft,createdAt,updatedAt`.json()
  return result
}
```

### PR Detail Component

```tsx
// src/components/PRDetail.tsx
import { theme } from "../theme"
import type { PRDetail } from "../providers/github"

interface PRDetailProps {
  pr: PRDetail
}

export function PRDetailView({ pr }: PRDetailProps) {
  return (
    <box flexDirection="column" padding={1}>
      {/* Header */}
      <box height={1}>
        <text>
          <span fg={theme.primary}>#{pr.number}</span>
          {" "}
          <span fg={theme.text}>{pr.title}</span>
        </text>
      </box>
      
      {/* Meta */}
      <box height={1}>
        <text fg={theme.textDim}>
          {pr.author.login} wants to merge {pr.headRefName} into {pr.baseRefName}
        </text>
      </box>
      
      {/* Labels */}
      {pr.labels.length > 0 && (
        <box height={1} flexDirection="row" gap={1}>
          {pr.labels.map(label => (
            <text key={label.name} fg={`#${label.color}`}>
              [{label.name}]
            </text>
          ))}
        </box>
      )}
      
      {/* Checks */}
      <box marginTop={1}>
        <text fg={theme.textMuted}>Checks:</text>
      </box>
      {pr.statusCheckRollup?.contexts.map(check => (
        <box key={check.name} height={1} paddingLeft={2}>
          <text>
            <span fg={check.conclusion === "SUCCESS" ? theme.success : theme.error}>
              {check.conclusion === "SUCCESS" ? "+" : "x"}
            </span>
            {" "}
            <span fg={theme.text}>{check.name}</span>
          </text>
        </box>
      ))}
      
      {/* Description */}
      <box marginTop={1} flexGrow={1}>
        <scrollbox>
          <text fg={theme.text}>{pr.body || "No description"}</text>
        </scrollbox>
      </box>
    </box>
  )
}
```

### State Updates

```typescript
// Add to state.ts
export interface AppState {
  // ... existing
  selectedPRDetail: PRDetail | null
  loadingDetail: boolean
}

export type AppAction =
  // ... existing
  | { type: "SET_PR_DETAIL"; detail: PRDetail | null }
  | { type: "SET_LOADING_DETAIL"; loading: boolean }
```

## File Structure

```
src/
├── providers/
│   └── github.ts           # Add getPRDetail
└── components/
    └── PRDetail.tsx        # Detail view component
```
