/**
 * Jump from a PR straight to the CI that is holding it up.
 */

import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName } from "../types"
import { logRequest } from "../utils/logger"

export interface OpenChecksResult {
  success: boolean
  message: string
}

export interface RollupEntry {
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
  detailsUrl?: string
  targetUrl?: string
  workflowName?: string
}

/** Conclusions that mean a check went red, mirroring computeCheckState */
const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"])
const FAILED_STATES = new Set(["FAILURE", "ERROR"])

function isFailing(entry: RollupEntry): boolean {
  if (entry.state) return FAILED_STATES.has(entry.state)
  return entry.conclusion ? FAILED_CONCLUSIONS.has(entry.conclusion) : false
}

function entryUrl(entry: RollupEntry): string | null {
  return entry.detailsUrl || entry.targetUrl || null
}

/**
 * Open whatever the user actually needs to look at:
 *
 * - one red check → its job page, no hunting
 * - several       → the PR's checks tab, which lists them together
 * - none, but checks exist → the checks tab anyway (that is where re-run lives)
 * - no checks at all → the branch's workflow runs, because a PR blocked on checks that
 *   never reported has an empty checks tab and the queued runs are on the Actions page
 */
export async function openFailingChecks(pr: PR): Promise<OpenChecksResult> {
  const repo = getRepoName(pr)
  const log = logRequest("gh", `pr view ${repo}#${pr.number} --json statusCheckRollup`)

  const rollup = await $`gh pr view ${pr.number} -R ${repo} --json statusCheckRollup --jq .statusCheckRollup`
    .quiet()
    .json()
    .then((value) => (Array.isArray(value) ? (value as RollupEntry[]) : []))
    .catch((error) => {
      log.fail(error)
      return null
    })

  if (rollup === null) {
    return { success: false, message: "Could not read checks for this PR" }
  }
  log.finish(`${rollup.length} checks`)

  const target = chooseChecksTarget(pr, rollup)
  if (!target.url) return { success: false, message: target.message }

  await openUrl(target.url)
  return { success: true, message: target.message }
}

/** Which page answers "why is CI holding this up", given what the rollup reports */
export function chooseChecksTarget(
  pr: PR,
  rollup: RollupEntry[]
): { url: string | null; message: string } {
  const repo = getRepoName(pr)
  const failing = rollup.filter(isFailing)

  if (failing.length === 1) {
    const url = entryUrl(failing[0])
    if (url) {
      return { url, message: `Opened ${failing[0].name || failing[0].context || "check"}` }
    }
  }

  if (rollup.length === 0) {
    const branch = pr.headRefName
    if (!branch) return { url: null, message: "No checks on this PR" }
    return {
      url: `https://github.com/${repo}/actions?query=${encodeURIComponent(`branch:${branch}`)}`,
      message: `No checks reported — opened workflow runs for ${branch}`,
    }
  }

  return {
    url: `${pr.url}/checks`,
    message:
      failing.length > 1
        ? `Opened checks — ${failing.length} failing`
        : "Opened checks — none failing",
  }
}

export interface WorkflowRun {
  id: number
  name?: string
  status?: string
  conclusion?: string | null
}

/** Conclusions worth re-running. CANCELLED is included: it is a run that never finished. */
const RERUNNABLE = new Set(["failure", "timed_out", "startup_failure", "cancelled"])

export function selectRerunnableRuns(runs: WorkflowRun[]): WorkflowRun[] {
  return runs.filter((run) => RERUNNABLE.has((run.conclusion ?? "").toLowerCase()))
}

/**
 * `--failed` restarts only failed jobs, so it needs failed jobs to exist. A
 * startup_failure never created any, and a run cancelled while still queued has none
 * either — both must go again in full.
 */
export function rerunNeedsFullRun(run: WorkflowRun): boolean {
  const conclusion = (run.conclusion ?? "").toLowerCase()
  return conclusion === "startup_failure" || conclusion === "cancelled"
}

/**
 * Re-run the CI for the PR's head commit.
 *
 * `--failed` restarts only the failed jobs, which is what you want for an ordinary red
 * build. A `startup_failure` run never created any jobs, so there is nothing for
 * `--failed` to select and the whole run has to go again.
 */
export async function rerunChecks(pr: PR): Promise<OpenChecksResult> {
  const repo = getRepoName(pr)
  const sha = pr.headRefOid
  if (!sha) return { success: false, message: "No head commit known for this PR" }

  const log = logRequest("gh", `actions/runs ${repo}@${sha.slice(0, 8)}`)
  const runs = await $`gh api ${`repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`} --jq .workflow_runs`
    .quiet()
    .json()
    .then((value) => (Array.isArray(value) ? (value as WorkflowRun[]) : []))
    .catch((error) => {
      log.fail(error)
      return null
    })

  if (runs === null) return { success: false, message: "Could not list workflow runs" }
  log.finish(`${runs.length} runs`)

  const rerunnable = selectRerunnableRuns(runs)

  if (rerunnable.length === 0) {
    const queued = runs.filter((run) => run.status === "queued" || run.status === "in_progress")
    if (queued.length > 0) {
      return {
        success: false,
        message: `${queued.length} run(s) still queued — nothing finished to re-run`,
      }
    }
    return { success: false, message: "No finished runs to re-run — use Trigger workflow…" }
  }

  const results = await Promise.all(
    rerunnable.map(async (run) => {
      // A startup_failure has no jobs, so --failed would select nothing
      const args = rerunNeedsFullRun(run)
        ? ["run", "rerun", String(run.id), "-R", repo]
        : ["run", "rerun", String(run.id), "-R", repo, "--failed"]
      const rerun = logRequest("gh", `run rerun ${run.id}`)
      try {
        await $`gh ${args}`.quiet()
        rerun.finish()
        return true
      } catch (error) {
        rerun.fail(error)
        return false
      }
    })
  )

  const ok = results.filter(Boolean).length
  if (ok === 0) return { success: false, message: "Re-run was refused for every run" }
  return {
    success: true,
    message: ok === rerunnable.length
      ? `Re-running ${ok} workflow run(s)`
      : `Re-running ${ok} of ${rerunnable.length} run(s)`,
  }
}

/** `gh browse` resolves the user's browser the same way `gh pr view --web` does */
async function openUrl(url: string): Promise<void> {
  await $`gh browse ${url}`.quiet()
}
