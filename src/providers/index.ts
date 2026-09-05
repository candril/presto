/**
 * The active PR source and one function per method on it, so call sites import plain
 * functions and never see which backend is answering.
 */

import type { PRSource } from "./source"
import * as github from "./github"
import { initGraphQL } from "./graphql"
import * as review from "../actions/review"
import * as automerge from "../actions/automerge"
import * as branch from "../actions/branch"
import * as merge from "../actions/merge"
import * as state from "../actions/state"
import * as checks from "../actions/checks"
import * as workflows from "../actions/workflows"
import * as tools from "../actions/tools"
import * as checkout from "../actions/checkout"

export type { PRSource, ActionResult, PRListState } from "./source"
export type { RepoFetchResult } from "./graphql"
export { isMergeableState, mergeableStateToStatus, type PRMergeState, type RepoMergeSettings } from "../actions/merge"
export type { ReviewEvent } from "../actions/review"
export type { UpdateStrategy } from "../actions/branch"
export type { WorkflowInput, WorkflowSummary } from "../actions/workflows"

/** The real thing: `gh` and GitHub's GraphQL API */
export const githubSource: PRSource = {
  init: initGraphQL,
  getCurrentUser: github.getCurrentUser,
  listPRs: github.listPRs,
  listClosedPRs: github.listClosedPRs,
  listMergedPRs: github.listMergedPRs,
  listPRsFromRepos: github.listPRsFromRepos,
  getPRsByBranch: github.getPRsByBranch,
  getPR: github.getPR,
  getPRsBulk: github.getPRsBulk,
  fetchPRPreview: github.fetchPRPreview,
  submitPRReview: review.submitPRReview,
  executeMerge: merge.executeMerge,
  enableAutoMerge: automerge.enableAutoMerge,
  disableAutoMerge: automerge.disableAutoMerge,
  updateBranchFromBase: branch.updateBranchFromBase,
  markReady: state.markReady,
  convertToDraft: state.convertToDraft,
  closePR: state.closePR,
  reopenPR: state.reopenPR,
  getPRMergeState: merge.getPRMergeState,
  getRepoMergeSettings: merge.getRepoMergeSettings,
  rerunChecks: checks.rerunChecks,
  openFailingChecks: checks.openFailingChecks,
  listWorkflows: workflows.listWorkflows,
  getWorkflowInputs: workflows.getWorkflowInputs,
  getRepoEnvironments: workflows.getRepoEnvironments,
  isForkPR: workflows.isForkPR,
  dispatchWorkflow: workflows.dispatchWorkflow,
  openInBrowser: tools.openInBrowser,
  openRepoInBrowser: tools.openRepoInBrowser,
  openInRiff: tools.openInRiff,
  openInRiffTmuxWindow: tools.openInRiffTmuxWindow,
  openDiff: tools.openDiff,
  checkoutPR: checkout.checkoutPR,
}

let active: PRSource = githubSource
let demo = false

/** Swap the backend before the TUI mounts; nothing caches the source */
export function usePRSource(source: PRSource, options: { demo?: boolean } = {}): void {
  active = source
  demo = options.demo ?? false
}

/** True when the demo source is active (spec 042) — only the header cares */
export function isDemoMode(): boolean {
  return demo
}

export const initSource: PRSource["init"] = () => active.init()
export const getCurrentUser: PRSource["getCurrentUser"] = () => active.getCurrentUser()
export const listPRs: PRSource["listPRs"] = (...args) => active.listPRs(...args)
export const listClosedPRs: PRSource["listClosedPRs"] = (...args) => active.listClosedPRs(...args)
export const listMergedPRs: PRSource["listMergedPRs"] = (...args) => active.listMergedPRs(...args)
export const listPRsFromRepos: PRSource["listPRsFromRepos"] = (...args) => active.listPRsFromRepos(...args)
export const getPRsByBranch: PRSource["getPRsByBranch"] = (...args) => active.getPRsByBranch(...args)
export const getPR: PRSource["getPR"] = (...args) => active.getPR(...args)
export const getPRsBulk: PRSource["getPRsBulk"] = (...args) => active.getPRsBulk(...args)
export const fetchPRPreview: PRSource["fetchPRPreview"] = (...args) => active.fetchPRPreview(...args)
export const submitPRReview: PRSource["submitPRReview"] = (...args) => active.submitPRReview(...args)
export const executeMerge: PRSource["executeMerge"] = (...args) => active.executeMerge(...args)
export const enableAutoMerge: PRSource["enableAutoMerge"] = (...args) => active.enableAutoMerge(...args)
export const disableAutoMerge: PRSource["disableAutoMerge"] = (...args) => active.disableAutoMerge(...args)
export const updateBranchFromBase: PRSource["updateBranchFromBase"] = (...args) => active.updateBranchFromBase(...args)
export const markReady: PRSource["markReady"] = (...args) => active.markReady(...args)
export const convertToDraft: PRSource["convertToDraft"] = (...args) => active.convertToDraft(...args)
export const closePR: PRSource["closePR"] = (...args) => active.closePR(...args)
export const reopenPR: PRSource["reopenPR"] = (...args) => active.reopenPR(...args)
export const getPRMergeState: PRSource["getPRMergeState"] = (...args) => active.getPRMergeState(...args)
export const getRepoMergeSettings: PRSource["getRepoMergeSettings"] = (...args) => active.getRepoMergeSettings(...args)
export const rerunChecks: PRSource["rerunChecks"] = (...args) => active.rerunChecks(...args)
export const openFailingChecks: PRSource["openFailingChecks"] = (...args) => active.openFailingChecks(...args)
export const listWorkflows: PRSource["listWorkflows"] = (...args) => active.listWorkflows(...args)
export const getWorkflowInputs: PRSource["getWorkflowInputs"] = (...args) => active.getWorkflowInputs(...args)
export const getRepoEnvironments: PRSource["getRepoEnvironments"] = (...args) => active.getRepoEnvironments(...args)
export const isForkPR: PRSource["isForkPR"] = (...args) => active.isForkPR(...args)
export const dispatchWorkflow: PRSource["dispatchWorkflow"] = (...args) => active.dispatchWorkflow(...args)
export const openInBrowser: PRSource["openInBrowser"] = (...args) => active.openInBrowser(...args)
export const openRepoInBrowser: PRSource["openRepoInBrowser"] = (...args) => active.openRepoInBrowser(...args)
export const openInRiff: PRSource["openInRiff"] = (...args) => active.openInRiff(...args)
export const openInRiffTmuxWindow: PRSource["openInRiffTmuxWindow"] = (...args) => active.openInRiffTmuxWindow(...args)
export const openDiff: PRSource["openDiff"] = (...args) => active.openDiff(...args)
export const checkoutPR: PRSource["checkoutPR"] = (...args) => active.checkoutPR(...args)
