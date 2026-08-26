/**
 * Arm and disarm GitHub's auto-merge ("merge when ready") on a PR.
 */

import { $ } from "bun"
import type { MergeMethod, PR } from "../types"
import { getRepoName } from "../types"

export interface AutoMergeResult {
  success: boolean
  message: string
}

const METHOD_FLAG: Record<MergeMethod, string> = {
  merge: "--merge",
  squash: "--squash",
  rebase: "--rebase",
}

const METHOD_LABEL: Record<MergeMethod, string> = {
  merge: "merge commit",
  squash: "squash",
  rebase: "rebase",
}

/**
 * GitHub refuses to arm auto-merge on a PR that could be merged right now, and
 * on repos with the feature switched off — both surface as `gh` stderr.
 */
export async function enableAutoMerge(pr: PR, method: MergeMethod): Promise<AutoMergeResult> {
  const repo = getRepoName(pr)
  try {
    const result = await $`gh pr merge ${pr.number} -R ${repo} --auto ${METHOD_FLAG[method]}`.quiet()
    if (result.exitCode !== 0) {
      return { success: false, message: cleanError(result.stderr.toString()) }
    }
    return { success: true, message: `Auto-merge (${METHOD_LABEL[method]}) armed on #${pr.number}` }
  } catch (e: any) {
    return { success: false, message: cleanError(e?.stderr?.toString?.() ?? e?.message) }
  }
}

export async function disableAutoMerge(pr: PR): Promise<AutoMergeResult> {
  const repo = getRepoName(pr)
  try {
    const result = await $`gh pr merge ${pr.number} -R ${repo} --disable-auto`.quiet()
    if (result.exitCode !== 0) {
      return { success: false, message: cleanError(result.stderr.toString()) }
    }
    return { success: true, message: `Auto-merge disabled on #${pr.number}` }
  } catch (e: any) {
    return { success: false, message: cleanError(e?.stderr?.toString?.() ?? e?.message) }
  }
}

function cleanError(stderr: string | undefined): string {
  return stderr?.trim() || "Auto-merge request failed"
}
