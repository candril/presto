/**
 * Actions module - external tool integration
 */

export { updateBranchFromBase, type UpdateStrategy } from "./branch"
export { enableAutoMerge, disableAutoMerge } from "./automerge"
export { openInBrowser, openRepoInBrowser, openInRiff, openInRiffTmuxWindow, openDiff, copyPRUrl, copyPRNumber, copyPRBranch } from "./tools"
