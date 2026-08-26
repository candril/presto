/**
 * Whether a base branch requires PRs to be up to date before merging.
 *
 * Classic branch protection (`/branches/{branch}/protection`) needs admin rights and
 * 404s for most users; the rulesets endpoint carries the same fact and needs only read
 * access.
 */

import { $ } from "bun"
import { logRequest } from "../utils/logger"

interface BranchRule {
  type?: string
  parameters?: { strict_required_status_checks_policy?: boolean }
}

/** Keyed by `repo@branch` — a repo can require it on one branch and not another */
const strictnessCache = new Map<string, boolean>()

/**
 * Several rulesets can apply to one branch, and any one of them requiring an up-to-date
 * branch is enough to block the merge.
 *
 * Falls back to `false` when the lookup fails: callers OR this with GitHub's own BEHIND
 * verdict, so an unreachable endpoint under-reports rather than crying wolf.
 */
export async function requiresUpToDateBranch(repo: string, branch: string): Promise<boolean> {
  const key = `${repo}@${branch}`
  const cached = strictnessCache.get(key)
  if (cached !== undefined) return cached

  const log = logRequest("gh", `rules/branches ${key}`)
  try {
    const rules = (await $`gh api repos/${repo}/rules/branches/${branch}`.quiet().json()) as BranchRule[]
    const strict = Array.isArray(rules)
      ? rules.some(
          (rule) =>
            rule.type === "required_status_checks" &&
            rule.parameters?.strict_required_status_checks_policy === true
        )
      : false
    strictnessCache.set(key, strict)
    log.finish(strict ? "up-to-date required" : "up-to-date optional")
    return strict
  } catch (error) {
    log.fail(error)
    strictnessCache.set(key, false)
    return false
  }
}

/**
 * Stamp `baseUpdateRequired` onto freshly fetched PRs.
 *
 * Resolved here rather than at render time so the flag lands in the on-disk PR cache and
 * the list stays synchronous.
 */
export async function stampBaseUpdateRequired<T extends { baseRefName: string | null; mergeStateStatus: string | null; baseUpdateRequired: boolean }>(
  prs: T[],
  repoOf: (pr: T) => string
): Promise<T[]> {
  const branches = new Map<string, { repo: string; branch: string }>()
  for (const pr of prs) {
    if (!pr.baseRefName) continue
    const repo = repoOf(pr)
    branches.set(`${repo}@${pr.baseRefName}`, { repo, branch: pr.baseRefName })
  }

  const strictness = new Map<string, boolean>()
  await Promise.all(
    [...branches].map(async ([key, { repo, branch }]) => {
      strictness.set(key, await requiresUpToDateBranch(repo, branch))
    })
  )

  for (const pr of prs) {
    // GitHub reporting BEHIND already proves it blocks, whatever the rules lookup said
    pr.baseUpdateRequired =
      pr.mergeStateStatus === "BEHIND" ||
      (pr.baseRefName ? strictness.get(`${repoOf(pr)}@${pr.baseRefName}`) === true : false)
  }
  return prs
}
