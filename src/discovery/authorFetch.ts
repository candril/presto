/**
 * Which of an author's PRs still have to be asked for.
 *
 * The initial load is the 50 most recently updated open PRs per repo (spec 019). On a
 * busy repo that window can be a few days wide, so somebody's older PR is not in the
 * list for an `@author` filter to find — it has to be fetched by name.
 */

/** One repo to ask about one author, and the key that keeps it from being asked twice. */
export interface AuthorFetch {
  author: string
  repo: string
  cacheKey: string
}

export interface PlanAuthorFetchesInput {
  /** Author logins from the filter, already resolved (`@me` → the login) */
  authors: string[]
  /** `state:` entries from the filter */
  states: string[]
  /** `repo:` entries from the filter */
  repoFilters: string[]
  /** Configured repos that are fetched by default */
  enabledRepos: string[]
  /** Every configured repo, including the ones only a `repo:` filter reaches */
  allRepos: string[]
  /** Repos already fetched, per author */
  fetched: Map<string, Set<string>>
}

export function planAuthorFetches({
  authors,
  states,
  repoFilters,
  enabledRepos,
  allRepos,
  fetched,
}: PlanAuthorFetchesInput): AuthorFetch[] {
  if (authors.length === 0) return []

  // A closed- or merged-only filter is served by the closed/merged backfill, which
  // already narrows by author. Fetching open PRs for it would only add rows the state
  // filter throws away again.
  if (states.length > 0 && !states.includes("open")) return []

  // A `repo:` filter reaches the repos that are configured as hidden too — asking for
  // them by name is what turns them on.
  const candidates =
    repoFilters.length > 0
      ? allRepos.filter((repo) =>
          repoFilters.some((wanted) => repo.toLowerCase().includes(wanted.toLowerCase())),
        )
      : enabledRepos

  const plan: AuthorFetch[] = []
  for (const author of authors) {
    const done = fetched.get(author.toLowerCase())
    for (const repo of candidates) {
      const cacheKey = repo.toLowerCase()
      if (done?.has(cacheKey)) continue
      plan.push({ author, repo, cacheKey })
    }
  }
  return plan
}

/** Record a repo as fetched for an author, so the next filter change does not repeat it. */
export function claimAuthorFetch(
  fetched: Map<string, Set<string>>,
  author: string,
  cacheKey: string,
): void {
  const key = author.toLowerCase()
  const done = fetched.get(key) ?? new Set<string>()
  done.add(cacheKey)
  fetched.set(key, done)
}

/** Give a repo back after a failed fetch, so the next filter change retries it. */
export function releaseAuthorFetch(
  fetched: Map<string, Set<string>>,
  author: string,
  cacheKey: string,
): void {
  fetched.get(author.toLowerCase())?.delete(cacheKey)
}
