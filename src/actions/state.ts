/**
 * Draft / ready / close / reopen — the PR state flips that are a single `gh` call.
 */

import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName } from "../types"

export interface StateResult {
  success: boolean
  message: string
}

export async function markReady(pr: PR): Promise<StateResult> {
  await $`gh pr ready ${pr.number} -R ${getRepoName(pr)}`.quiet()
  return { success: true, message: `Marked #${pr.number} as ready` }
}

export async function convertToDraft(pr: PR): Promise<StateResult> {
  await $`gh pr ready ${pr.number} -R ${getRepoName(pr)} --undo`.quiet()
  return { success: true, message: `Converted #${pr.number} to draft` }
}

export async function closePR(pr: PR): Promise<StateResult> {
  await $`gh pr close ${pr.number} -R ${getRepoName(pr)}`.quiet()
  return { success: true, message: `Closed #${pr.number}` }
}

export async function reopenPR(pr: PR): Promise<StateResult> {
  await $`gh pr reopen ${pr.number} -R ${getRepoName(pr)}`.quiet()
  return { success: true, message: `Reopened #${pr.number}` }
}
