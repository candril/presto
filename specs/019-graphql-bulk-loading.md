# GraphQL Bulk Loading

**Status**: Done

## Description

Optimize PR data fetching by using GitHub's GraphQL API to load PRs from multiple repositories in a single API call. This replaces the current approach of spawning one `gh pr list` process per repository.

## Out of Scope

- Pagination for very large result sets (future enhancement)
- GraphQL subscriptions for real-time updates
- Caching GraphQL responses differently than REST

## Capabilities

### P1 - Must Have

- Single GraphQL query to fetch PRs from all configured repos
- Fetch same fields as current REST implementation
- Graceful fallback if GraphQL fails (use existing REST approach)
- Support for fetching specific PRs by repo/number (for tracked PRs)

### P2 - Should Have

- Priority loading: fetch visible/filtered repos first, then background load rest
- Batch individual PR fetches (tracked PRs from non-configured repos)
- Rate limit awareness (check remaining quota)

### P3 - Nice to Have

- Progressive loading with cursor-based pagination
- Parallel GraphQL queries for very large repo lists (batches of 20)

## Technical Notes

### GraphQL Query Structure

Use aliased repository queries to fetch from multiple repos in one call:

```graphql
query {
  repo0: repository(owner: "owner1", name: "repo1") {
    pullRequests(first: 50, states: OPEN) {
      nodes {
        number
        title
        url
        state
        isDraft
        createdAt
        updatedAt
        author { login }
        reviewDecision
        comments { totalCount }
        reviews { totalCount }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
                contexts(first: 25) {
                  nodes {
                    ... on CheckRun {
                      name
                      status
                      conclusion
                    }
                    ... on StatusContext {
                      context
                      state
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  repo1: repository(owner: "owner2", name: "repo2") {
    # same structure
  }
}
```

### CLI Usage

```bash
gh api graphql -f query='...'
```

### Rate Limits

- GraphQL: 5,000 points/hour
- Each query costs ~1 point for simple queries
- Check rate limit: `gh api rate_limit --jq '.resources.graphql'`

### Transformation

Map GraphQL response to existing `PR` type:
- `statusCheckRollup` needs different parsing (nested in commits)
- `comments.totalCount` instead of array length
- `reviews.totalCount` for review count

## File Structure

```
src/
  providers/
    github.ts          # Add GraphQL functions alongside REST
    graphql.ts         # NEW: GraphQL query builder and executor
  hooks/
    usePRData.ts       # Switch to GraphQL bulk loading
```

## Implementation Plan

1. Create `graphql.ts` with query builder
2. Add `listPRsGraphQL(repos: string[])` function
3. Update `usePRData.ts` to use GraphQL
4. Test with fallback to REST on error
