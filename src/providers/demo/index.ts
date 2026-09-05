/**
 * `PRSource` over the in-memory store (spec 042). Reads take a beat so the refresh
 * spinner shows, as it does against the real API; tools that would leave the
 * terminal say what they would have done instead.
 */

import type { PR } from "../../types"
import { getRepoName } from "../../types"
import type { PRSource } from "../source"
import { DemoStore } from "./store"
import { DEMO_REPOS, DEMO_USER, ENVIRONMENTS, REPO_MERGE_SETTINGS, WORKFLOWS } from "./fixtures"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const LIST_MS = 250
const PREVIEW_MS = 120
const ACTION_MS = 200

const wouldOpen = (what: string) => ({ success: true, message: `Demo — would open ${what}` })

export function createDemoSource(): PRSource {
  const store = new DemoStore()

  const listByState = async (repo: string, states: Array<PR["state"]>, author?: string) => {
    await sleep(LIST_MS)
    const prs = store.list([repo], states)
    return author ? prs.filter((pr) => pr.author.login === author) : prs
  }

  return {
    init: async () => {},
    getCurrentUser: async () => DEMO_USER,

    listPRs: async (repo, state = "open") => {
      await sleep(LIST_MS)
      const states: Array<PR["state"]> =
        state === "open" ? ["OPEN"] : state === "closed" ? ["CLOSED"] : state === "merged" ? ["MERGED"] : ["OPEN", "CLOSED", "MERGED"]
      return store.list(repo ? [repo] : DEMO_REPOS, states)
    },
    listClosedPRs: (repo, options) => listByState(repo, ["CLOSED"], options?.author),
    listMergedPRs: (repo, options) => listByState(repo, ["MERGED"], options?.author),
    listPRsFromRepos: async (repos) => {
      await sleep(LIST_MS)
      return { prs: store.list(repos.length > 0 ? repos : DEMO_REPOS, ["OPEN"]), failedRepos: [] }
    },
    getPRsByBranch: async (repos, branch) => {
      await sleep(LIST_MS)
      return store.byBranch(repos, branch)
    },
    getPR: async (repo, number) => {
      await sleep(PREVIEW_MS)
      return store.get(repo, number)
    },
    getPRsBulk: async (prs) => {
      await sleep(LIST_MS)
      return prs.map(({ repo, number }) => store.get(repo, number)).filter((pr): pr is PR => pr !== null)
    },
    fetchPRPreview: async (repo, number) => {
      await sleep(PREVIEW_MS)
      const preview = store.preview(repo, number)
      if (!preview) throw new Error(`demo: no preview for ${repo}#${number}`)
      return preview
    },

    submitPRReview: async (pr, event, body) => {
      await sleep(ACTION_MS)
      return store.review(pr, event, body)
    },
    executeMerge: async (pr, _repo, method) => {
      await sleep(ACTION_MS)
      return store.merge(pr, method)
    },
    enableAutoMerge: async (pr, method) => {
      await sleep(ACTION_MS)
      return store.setAutoMerge(pr, method)
    },
    disableAutoMerge: async (pr) => {
      await sleep(ACTION_MS)
      return store.setAutoMerge(pr, null)
    },
    updateBranchFromBase: async (pr, strategy) => {
      await sleep(ACTION_MS)
      return store.updateBranch(pr, strategy)
    },
    markReady: async (pr) => store.setDraft(pr, false),
    convertToDraft: async (pr) => store.setDraft(pr, true),
    closePR: async (pr) => store.setOpen(pr, false),
    reopenPR: async (pr) => store.setOpen(pr, true),
    getPRMergeState: async (repo, number) => {
      await sleep(PREVIEW_MS)
      return store.mergeState(repo, number)
    },
    getRepoMergeSettings: async (repo) =>
      REPO_MERGE_SETTINGS[repo] ?? { allowMergeCommit: true, allowSquashMerge: true, allowRebaseMerge: true, allowAutoMerge: false },
    rerunChecks: async (pr) => {
      await sleep(ACTION_MS)
      return store.rerunChecks(pr)
    },
    openFailingChecks: async (pr) => wouldOpen(`${pr.url}/checks`),

    listWorkflows: async (repo) => {
      await sleep(PREVIEW_MS)
      return (WORKFLOWS[repo] ?? []).map(({ id, name, path, state }) => ({ id, name, path, state }))
    },
    getWorkflowInputs: async (repo, path) => {
      const workflow = (WORKFLOWS[repo] ?? []).find((w) => w.path === path)
      return { dispatchable: workflow?.dispatchable ?? false, inputs: workflow?.inputs ?? [] }
    },
    getRepoEnvironments: async (repo) => ENVIRONMENTS[repo] ?? [],
    isForkPR: async () => false,
    dispatchWorkflow: async (repo, workflowId, ref) => {
      await sleep(ACTION_MS)
      const workflow = (WORKFLOWS[repo] ?? []).find((w) => w.id === workflowId)
      const pr = store.byBranch([repo], ref)[0]
      if (pr) store.dispatchWorkflow(pr)
      return { success: true, message: `Triggered ${workflow?.name ?? "workflow"}` }
    },

    openInBrowser: async (pr) => wouldOpen(pr.url),
    openRepoInBrowser: async (pr) => wouldOpen(`https://github.com/${getRepoName(pr)}`),
    openInRiff: async (pr) => wouldOpen(`${getRepoName(pr)}#${pr.number} in riff`),
    openInRiffTmuxWindow: async (pr) => wouldOpen(`${getRepoName(pr)}#${pr.number} in riff, in a new tmux window`),
    openDiff: async (pr) => wouldOpen(`the diff of #${pr.number} in your diff viewer`),
    checkoutPR: async (pr) => ({
      success: true,
      message: `Demo — would run gh pr checkout ${pr.number} in ~/code/${getRepoName(pr).split("/")[1]}`,
    }),
  }
}

/** The config the demo runs with — the fixture repos, and nothing that leaves the machine */
export function demoRepositories(): Array<{ name: string }> {
  return DEMO_REPOS.map((name) => ({ name }))
}
