# Filter Bot Comments

**Status**: Done

## Description

Filter out comments from bot accounts (like dependabot, renovate, github-actions, etc.) from comment counts and preview displays. Bots often generate noise in comment counts that obscures real human discussion.

## Out of Scope

- Configurable bot patterns (hardcoded list is fine for now)
- Showing bot comments in a separate section
- Bot comment statistics

## Capabilities

### P1 - Must Have

- **Filter in list view**: Exclude bot comments from the comment count shown in the PR list
- **Filter in preview**: Exclude bot comments from the recent comments section in preview panel
- **Common bot detection**: Detect common bot accounts by username patterns

### P2 - Should Have

- **GitHub app detection**: Use `[bot]` suffix in usernames (e.g., `dependabot[bot]`)
- **Configurable via config**: Allow users to add custom bot patterns in config file

### P3 - Nice to Have

- **Show bot indicator**: Option to show "(+N bot)" after comment count
- **Toggle to show bots**: Keyboard shortcut to temporarily include bot comments

## Bot Detection

Common bot patterns to filter:

```typescript
const BOT_PATTERNS = [
  /\[bot\]$/i,           // GitHub apps: dependabot[bot], github-actions[bot], dg-pull-request-notifier[bot]
  /^dependabot$/i,       // Legacy dependabot
  /^renovate$/i,         // Renovate bot
  /^github-actions$/i,   // GitHub Actions (legacy)
  /^codecov$/i,          // Codecov
  /^sonarcloud$/i,       // SonarCloud
  /^vercel$/i,           // Vercel
  /^netlify$/i,          // Netlify
  /^semantic-release$/i, // Semantic release
  /-reviewers$/i,        // Auto-reviewer bots: dg-dynamic-reviewers
  /-notifier$/i,         // Notifier bots
]

function isBot(username: string): boolean {
  return BOT_PATTERNS.some(pattern => pattern.test(username))
}
```

## Technical Notes

### Challenge: GraphQL totalCommentsCount

The `totalCommentsCount` field from GitHub's GraphQL API includes all comments - we cannot filter it server-side. Options:

1. **Option A**: Fetch actual comments and count non-bots (more API calls)
2. **Option B**: Accept that list count may include bots, only filter in preview
3. **Option C**: Fetch first N comments inline in GraphQL and filter client-side

Recommended: **Option C** - fetch `comments(first: 100)` with author login in the PR list query, filter client-side.

### Updated GraphQL Query

```graphql
# In PR_FRAGMENT
comments(first: 100) {
  totalCount
  nodes {
    author { login }
  }
}
reviews(first: 50) {
  totalCount
  nodes {
    author { login }
  }
}
```

### Transform Function

```typescript
function transformGraphQLPR(raw: any): PR {
  // Count non-bot comments
  const prComments = raw.comments?.nodes ?? []
  const reviewComments = raw.reviews?.nodes ?? []
  
  const humanCommentCount = 
    prComments.filter(c => !isBot(c.author?.login ?? "")).length +
    reviewComments.filter(r => !isBot(r.author?.login ?? "")).length
  
  return {
    // ...
    commentCount: humanCommentCount,
  }
}
```

### Preview Comments Filtering

```typescript
// In parseRecentComments()
function parseRecentComments(comments: any[], reviews: any[]): PreviewComment[] {
  const all: PreviewComment[] = []
  
  for (const c of comments ?? []) {
    if (isBot(c.author?.login ?? "")) continue  // Skip bots
    // ...
  }
  
  for (const r of reviews ?? []) {
    if (isBot(r.author?.login ?? "")) continue  // Skip bots
    // ...
  }
  
  // ...
}
```

### Config Extension (P2)

```toml
# In presto.toml
[filters]
# Additional bot patterns (regex)
bot_patterns = [
  "my-custom-bot",
  "internal-ci-.*"
]
```

```typescript
// In src/config/schema.ts
export interface FiltersConfig {
  botPatterns?: string[]
}
```

## File Structure

```
src/
├── utils/
│   └── bots.ts                 # isBot() function, BOT_PATTERNS
├── providers/
│   └── graphql.ts              # Update query, filter in transform
└── providers/
    └── github.ts               # Filter in parseRecentComments
```
