/**
 * Merge a PR, and the two lookups the merge dialog needs first: which methods the repo
 * allows, and whether GitHub would take the merge right now.
 */

import { $ } from "bun"
import type { MergeMethod, MergeStateStatus } from "../types"

/** Repo merge settings cache */
export interface RepoMergeSettings {
  allowMergeCommit: boolean
  allowSquashMerge: boolean
  allowRebaseMerge: boolean
  allowAutoMerge: boolean
}
const repoMergeSettingsCache = new Map<string, RepoMergeSettings>()

/** PR merge state */
export interface PRMergeState {
  /** null while GitHub is still computing the test merge */
  mergeable: boolean | null
  mergeableState: string // "clean", "unstable", "dirty", "blocked", "behind", "unknown"
  baseRef: string
}

export interface MergeResult {
  success: boolean
  message: string
}

/** Fetch PR merge state */
export async function getPRMergeState(repo: string, number: number): Promise<PRMergeState> {
  try {
    const result = await $`gh api repos/${repo}/pulls/${number} --jq '{mergeable: .mergeable, mergeableState: .mergeable_state, baseRef: .base.ref}'`.json()
    return result as PRMergeState
  } catch {
    return { mergeable: true, mergeableState: "unknown", baseRef: "" }
  }
}

/**
 * Whether GitHub would actually take the merge right now.
 *
 * The `mergeable` boolean only answers "no conflicts" — a PR that is behind a
 * strict base, or blocked by protection, reports `mergeable: true` and then has its
 * merge rejected. `mergeable_state` is the field that gates the merge button.
 */
export function isMergeableState(state: string): boolean {
  return state === "clean" || state === "unstable" || state === "has_hooks"
}

/**
 * Map REST `mergeable_state` onto the GraphQL vocabulary the PR rows render, so a
 * dialog that just fetched fresher truth can correct a stale row on the spot.
 */
export function mergeableStateToStatus(state: string): MergeStateStatus | null {
  switch (state) {
    case "clean":
      return "CLEAN"
    case "has_hooks":
      return "HAS_HOOKS"
    case "unstable":
      return "UNSTABLE"
    case "behind":
      return "BEHIND"
    case "dirty":
      return "DIRTY"
    case "blocked":
      return "BLOCKED"
    case "draft":
      return "DRAFT"
    case "unknown":
      return "UNKNOWN"
    default:
      return null
  }
}

/** Fetch and cache repo merge settings */
export async function getRepoMergeSettings(repo: string): Promise<RepoMergeSettings> {
  const cached = repoMergeSettingsCache.get(repo)
  if (cached) return cached

  try {
    const result = await $`gh api repos/${repo} --jq '{allowMergeCommit: .allow_merge_commit, allowSquashMerge: .allow_squash_merge, allowRebaseMerge: .allow_rebase_merge, allowAutoMerge: .allow_auto_merge}'`.json()
    const settings = result as RepoMergeSettings
    repoMergeSettingsCache.set(repo, settings)
    return settings
  } catch {
    // Default to all allowed if we can't fetch
    return { allowMergeCommit: true, allowSquashMerge: true, allowRebaseMerge: true, allowAutoMerge: false }
  }
}

/** Execute the actual merge with selected method */
export async function executeMerge(
  pr: { number: number; url: string },
  repo: string,
  method: MergeMethod
): Promise<MergeResult> {
  try {
    const flag = method === "merge" ? "--merge" : method === "squash" ? "--squash" : "--rebase"
    const result = await $`gh pr merge ${pr.number} -R ${repo} ${flag}`.quiet()
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr.toString().trim() || "Merge failed" }
    }
    return { success: true, message: `${mergeLabel(method)} #${pr.number}` }
  } catch (e: any) {
    const stderr = e?.stderr?.toString?.()?.trim() || e?.message || "Merge failed"
    return { success: false, message: stderr }
  }
}

export function mergeLabel(method: MergeMethod): string {
  return method === "merge" ? "Merged" : method === "squash" ? "Squash merged" : "Rebase merged"
}
