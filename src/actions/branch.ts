/**
 * Bring a PR's head branch up to date with its base branch.
 */

import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName } from "../types"

export type UpdateStrategy = "merge" | "rebase"

export interface BranchActionResult {
  success: boolean
  message: string
}

/**
 * Run `gh pr update-branch`, merging (or rebasing onto) the base branch.
 *
 * GitHub rejects this with a readable message when the branch is already up to
 * date or conflicts, so no pre-check is needed — the stderr is the user's answer.
 */
export async function updateBranchFromBase(
  pr: PR,
  strategy: UpdateStrategy
): Promise<BranchActionResult> {
  const repo = getRepoName(pr)
  const args = ["pr", "update-branch", String(pr.number), "-R", repo]
  if (strategy === "rebase") args.push("--rebase")

  try {
    const result = await $`gh ${args}`.quiet()
    if (result.exitCode !== 0) {
      return { success: false, message: cleanError(result.stderr.toString()) }
    }
    const label = strategy === "rebase" ? "Rebased" : "Updated"
    return { success: true, message: `${label} #${pr.number} onto its base branch` }
  } catch (e: any) {
    return { success: false, message: cleanError(e?.stderr?.toString?.() ?? e?.message) }
  }
}

function cleanError(stderr: string | undefined): string {
  return stderr?.trim() || "Update branch failed"
}
