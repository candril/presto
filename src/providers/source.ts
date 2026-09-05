/**
 * The seam between the UI and everything outside the process: GitHub, and the tools
 * a PR gets handed to (browser, riff, diff viewer, a local checkout).
 *
 * The UI only ever talks to this interface. `gh` backs it by default; `--demo` swaps in
 * an in-memory GitHub (spec 042). Tool opens report a result rather than returning
 * void for the same reason the mutations do: the demo answers them with "would open …"
 * through the same status line.
 */

import type { MergeMethod, PR, PRPreview } from "../types"
import type { RepoFetchResult } from "./graphql"
import type { ReviewEvent } from "../actions/review"
import type { UpdateStrategy } from "../actions/branch"
import type { PRMergeState, RepoMergeSettings } from "../actions/merge"
import type { WorkflowInput, WorkflowSummary } from "../actions/workflows"
import type { Config } from "../config"

export interface ActionResult {
  success: boolean
  message: string
}

export type PRListState = "open" | "closed" | "merged" | "all"

export interface PRSource {
  /** Warm whatever the first fetch would otherwise pay for (the `gh` token) */
  init(): Promise<void>
  getCurrentUser(): Promise<string>

  // Reads
  listPRs(repo?: string, state?: PRListState): Promise<PR[]>
  listClosedPRs(repo: string, options?: { author?: string; days?: number }): Promise<PR[]>
  listMergedPRs(repo: string, options?: { author?: string; days?: number }): Promise<PR[]>
  listPRsFromRepos(repos: string[]): Promise<RepoFetchResult>
  getPRsByBranch(repos: string[], branch: string): Promise<PR[]>
  getPR(repo: string, number: number): Promise<PR | null>
  getPRsBulk(prs: Array<{ repo: string; number: number }>): Promise<PR[]>
  fetchPRPreview(repo: string, number: number): Promise<PRPreview>

  // Mutations
  submitPRReview(pr: PR, event: ReviewEvent, body: string): Promise<ActionResult>
  executeMerge(pr: PR, repo: string, method: MergeMethod): Promise<ActionResult>
  enableAutoMerge(pr: PR, method: MergeMethod): Promise<ActionResult>
  disableAutoMerge(pr: PR): Promise<ActionResult>
  updateBranchFromBase(pr: PR, strategy: UpdateStrategy): Promise<ActionResult>
  markReady(pr: PR): Promise<ActionResult>
  convertToDraft(pr: PR): Promise<ActionResult>
  closePR(pr: PR): Promise<ActionResult>
  reopenPR(pr: PR): Promise<ActionResult>
  getPRMergeState(repo: string, number: number): Promise<PRMergeState>
  getRepoMergeSettings(repo: string): Promise<RepoMergeSettings>
  rerunChecks(pr: PR): Promise<ActionResult>
  openFailingChecks(pr: PR): Promise<ActionResult>

  // Workflows (spec 033)
  listWorkflows(repo: string): Promise<WorkflowSummary[]>
  getWorkflowInputs(repo: string, path: string): Promise<{ dispatchable: boolean; inputs: WorkflowInput[] }>
  getRepoEnvironments(repo: string): Promise<string[]>
  isForkPR(repo: string, number: number): Promise<boolean>
  dispatchWorkflow(repo: string, workflowId: number, ref: string, inputs: Record<string, string>): Promise<ActionResult>

  // Hand-offs to other tools
  openInBrowser(pr: PR): Promise<ActionResult>
  openRepoInBrowser(pr: PR): Promise<ActionResult>
  openInRiff(pr: PR): Promise<ActionResult>
  openInRiffTmuxWindow(pr: PR): Promise<ActionResult>
  openDiff(pr: PR, diffCommand: string): Promise<ActionResult>
  checkoutPR(pr: PR, config: Config): Promise<ActionResult>
}
