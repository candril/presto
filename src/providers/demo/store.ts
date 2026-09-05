/**
 * The demo's GitHub: a mutable copy of the fixtures plus the handful of things a user
 * can do to a PR from presto, each with the visible consequence GitHub would have.
 * Slow things (a branch update landing, checks running) take seconds instead of
 * minutes, so the marker → refresh → settled cycle can be watched in one sitting.
 */

import type { MergeMethod, PR, PRPreview, PreviewCheck, PreviewCheckStatus, StatusCheckRollup } from "../../types"
import { computeCheckState, getRepoName } from "../../types"
import type { ReviewEvent } from "../../actions/review"
import type { UpdateStrategy } from "../../actions/branch"
import type { PRMergeState } from "../../actions/merge"
import type { ActionResult } from "../source"
import { buildFixtures, fakeSha, DEMO_USER, type CheckSpec } from "./fixtures"

const key = (repo: string, number: number) => `${repo}#${number}`

/** How long the demo's CI takes, and how long GitHub takes to land a branch update */
const CHECKS_RUN_MS = 4_000
const BRANCH_UPDATE_MS = 1_500

export class DemoStore {
  private prs = new Map<string, PR>()
  private previews = new Map<string, PRPreview>()
  private shaSeed = 9_000

  constructor() {
    for (const { pr, preview } of buildFixtures()) {
      const k = key(getRepoName(pr), pr.number)
      this.prs.set(k, pr)
      this.previews.set(k, preview)
    }
  }

  // ── reads ────────────────────────────────────────────────────────────────────

  private clone<T>(value: T): T {
    return structuredClone(value)
  }

  list(repos: string[], states: Array<PR["state"]>): PR[] {
    const wanted = new Set(repos.map((r) => r.toLowerCase()))
    return [...this.prs.values()]
      .filter((pr) => wanted.has(getRepoName(pr).toLowerCase()) && states.includes(pr.state))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((pr) => this.clone(pr))
  }

  get(repo: string, number: number): PR | null {
    const pr = this.find(repo, number)
    return pr ? this.clone(pr) : null
  }

  byBranch(repos: string[], branch: string): PR[] {
    const wanted = new Set(repos.map((r) => r.toLowerCase()))
    return [...this.prs.values()]
      .filter((pr) => wanted.has(getRepoName(pr).toLowerCase()) && pr.headRefName?.toLowerCase() === branch.toLowerCase())
      .map((pr) => this.clone(pr))
  }

  preview(repo: string, number: number): PRPreview | null {
    const pr = this.find(repo, number)
    const preview = this.previews.get(key(repo, number))
    if (!pr || !preview) return null
    return {
      ...this.clone(preview),
      state: pr.state,
      isDraft: pr.isDraft,
      commentCount: pr.commentCount,
      checks: previewChecks(pr.statusCheckRollup),
      mergeable: pr.mergeStateStatus === "DIRTY" ? "CONFLICTING" : pr.mergeStateStatus === "UNKNOWN" ? "UNKNOWN" : "MERGEABLE",
    }
  }

  mergeState(repo: string, number: number): PRMergeState {
    const pr = this.find(repo, number)
    if (!pr) return { mergeable: null, mergeableState: "unknown", baseRef: "" }
    return {
      mergeable: pr.mergeStateStatus === "DIRTY" ? false : pr.mergeStateStatus === "UNKNOWN" ? null : true,
      mergeableState: (pr.mergeStateStatus ?? "unknown").toLowerCase(),
      baseRef: pr.baseRefName ?? "main",
    }
  }

  // ── mutations ────────────────────────────────────────────────────────────────

  review(target: PR, event: ReviewEvent, body: string): ActionResult {
    const pr = this.live(target)
    const preview = this.previews.get(key(getRepoName(pr), pr.number))!
    if (event === "APPROVE" && pr.author.login === DEMO_USER) {
      return { success: false, message: "Can not approve your own pull request" }
    }

    const now = new Date().toISOString()
    const state = event === "APPROVE" ? "APPROVED" : event === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "COMMENTED"
    preview.reviews = [...preview.reviews.filter((r) => r.author !== DEMO_USER), { author: DEMO_USER, state, submittedAt: now }]
    preview.requestedReviewers = preview.requestedReviewers.filter((r) => r !== DEMO_USER)
    if (body.trim()) {
      preview.recentComments = [{ author: DEMO_USER, body, createdAt: now, isReviewComment: false }, ...preview.recentComments]
    }
    // A review body is a comment in GitHub's count, an empty approval is not
    if (body.trim() || event !== "APPROVE") pr.commentCount += 1

    if (event === "APPROVE") {
      pr.reviewDecision = "APPROVED"
      pr.approvedBy = [...new Set([...pr.approvedBy, DEMO_USER])]
    } else if (event === "REQUEST_CHANGES") {
      pr.reviewDecision = "CHANGES_REQUESTED"
      pr.approvedBy = pr.approvedBy.filter((login) => login !== DEMO_USER)
    }
    this.touch(pr)
    this.settleMergeState(pr)

    const label = event === "APPROVE" ? "Approved" : event === "REQUEST_CHANGES" ? "Requested changes on" : "Commented on"
    return { success: true, message: `${label} #${pr.number}` }
  }

  merge(target: PR, method: MergeMethod): ActionResult {
    const pr = this.live(target)
    if (pr.isDraft) return { success: false, message: `Pull request #${pr.number} is a draft and cannot be merged` }
    if (!this.isMergeable(pr)) {
      return { success: false, message: `Pull request #${pr.number} is not mergeable: the base branch policy prohibits the merge` }
    }
    pr.state = "MERGED"
    pr.autoMergeMethod = null
    this.touch(pr)
    const label = method === "merge" ? "Merged" : method === "squash" ? "Squash merged" : "Rebase merged"
    return { success: true, message: `${label} #${pr.number}` }
  }

  setAutoMerge(target: PR, method: MergeMethod | null): ActionResult {
    const pr = this.live(target)
    if (method === null) {
      pr.autoMergeMethod = null
      this.touch(pr)
      return { success: true, message: `Auto-merge disabled on #${pr.number}` }
    }
    // GitHub refuses to arm auto-merge on a PR it would merge right now
    if (this.isMergeable(pr)) {
      return { success: false, message: "Pull request is in clean status (enablePullRequestAutoMerge)" }
    }
    pr.autoMergeMethod = method
    this.touch(pr)
    const label = method === "merge" ? "merge commit" : method
    return { success: true, message: `Auto-merge (${label}) armed on #${pr.number}` }
  }

  updateBranch(target: PR, strategy: UpdateStrategy): ActionResult {
    const pr = this.live(target)
    if (pr.baseSync !== "behind") {
      return { success: false, message: `#${pr.number} is already up to date with ${pr.baseRefName ?? "its base"}` }
    }
    // GitHub accepts at once and lands the commit a moment later — the row keeps its
    // pending marker until a refresh sees the new head
    setTimeout(() => {
      const preview = this.previews.get(key(getRepoName(pr), pr.number))!
      const now = new Date().toISOString()
      pr.headRefOid = fakeSha(this.shaSeed++)
      pr.headCommittedAt = now
      pr.baseSync = "up-to-date"
      pr.baseUpdateRequired = false
      if (pr.mergeStateStatus === "BEHIND") pr.mergeStateStatus = "BLOCKED"
      preview.commits = [
        ...preview.commits,
        {
          oid: pr.headRefOid.slice(0, 7),
          message: strategy === "rebase" ? `Rebase onto ${pr.baseRefName}` : `Merge branch '${pr.baseRefName}' into ${pr.headRefName}`,
          author: pr.author.login,
          committedAt: now,
        },
      ]
      this.touch(pr)
      this.runChecks(pr)
    }, BRANCH_UPDATE_MS)
    const label = strategy === "rebase" ? "Rebased" : "Updated"
    return { success: true, message: `${label} #${pr.number} onto its base branch` }
  }

  rerunChecks(target: PR): ActionResult {
    const pr = this.live(target)
    const state = computeCheckState(pr.statusCheckRollup)
    if (state === "PENDING") {
      return { success: false, message: "1 run(s) still queued — nothing finished to re-run" }
    }
    if (state === "SUCCESS") {
      return { success: false, message: "No finished runs to re-run — use Trigger workflow…" }
    }
    this.runChecks(pr)
    return { success: true, message: "Re-running 1 workflow run(s)" }
  }

  setDraft(target: PR, draft: boolean): ActionResult {
    const pr = this.live(target)
    pr.isDraft = draft
    pr.mergeStateStatus = draft ? "DRAFT" : "BLOCKED"
    if (!draft) this.settleMergeState(pr)
    this.touch(pr)
    return { success: true, message: draft ? `Converted #${pr.number} to draft` : `Marked #${pr.number} as ready` }
  }

  setOpen(target: PR, open: boolean): ActionResult {
    const pr = this.live(target)
    pr.state = open ? "OPEN" : "CLOSED"
    this.touch(pr)
    return { success: true, message: open ? `Reopened #${pr.number}` : `Closed #${pr.number}` }
  }

  /** A workflow dispatched against the head kicks off a fresh run */
  dispatchWorkflow(target: PR): void {
    this.runChecks(this.live(target))
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private find(repo: string, number: number): PR | undefined {
    return this.prs.get(key(repo, number))
  }

  /** The store's own record for a PR the UI handed back (which is a clone) */
  private live(target: PR): PR {
    const pr = this.find(getRepoName(target), target.number)
    if (!pr) throw new Error(`demo: unknown PR ${getRepoName(target)}#${target.number}`)
    return pr
  }

  private touch(pr: PR): void {
    pr.updatedAt = new Date().toISOString()
  }

  private isMergeable(pr: PR): boolean {
    return pr.mergeStateStatus === "CLEAN" || pr.mergeStateStatus === "UNSTABLE" || pr.mergeStateStatus === "HAS_HOOKS"
  }

  /**
   * GitHub flips BLOCKED to CLEAN once every gate is satisfied. The demo has no
   * rulesets to consult, so the gates are: approved, green, current, no open threads.
   */
  private settleMergeState(pr: PR): void {
    if (pr.isDraft || pr.state !== "OPEN") return
    const green = computeCheckState(pr.statusCheckRollup) === "SUCCESS"
    const gated = pr.mergeStateStatus === "BLOCKED" || pr.mergeStateStatus === "CLEAN"
    if (!gated) return
    const clear = pr.reviewDecision === "APPROVED" && green && pr.baseSync !== "behind" && pr.unresolvedThreads === 0
    pr.mergeStateStatus = clear ? "CLEAN" : "BLOCKED"
  }

  /** Checks go running now and green in a few seconds */
  private runChecks(pr: PR): void {
    pr.statusCheckRollup = rollup("running")
    pr.checksQueued = false
    this.touch(pr)
    setTimeout(() => {
      pr.statusCheckRollup = rollup("pass")
      this.touch(pr)
      this.settleMergeState(pr)
      // Auto-merge lands the moment the last gate clears
      if (pr.autoMergeMethod && this.isMergeable(pr)) {
        pr.state = "MERGED"
        pr.autoMergeMethod = null
      }
    }, CHECKS_RUN_MS)
  }
}

function rollup(spec: Extract<CheckSpec, "pass" | "running">): StatusCheckRollup {
  const names = ["build", "test", "lint"]
  if (spec === "pass") {
    return names.map((name) => ({ __typename: "CheckRun" as const, name, status: "COMPLETED" as const, conclusion: "SUCCESS" as const, workflowName: "CI" }))
  }
  return names.map((name) => ({ __typename: "CheckRun" as const, name, status: "IN_PROGRESS" as const, conclusion: null, workflowName: "CI" }))
}

function previewChecks(rollupState: StatusCheckRollup | null): PreviewCheckStatus {
  const checks: PreviewCheck[] = (rollupState ?? []).map((run) => ({
    name: run.name,
    status:
      run.status !== "COMPLETED" ? "pending"
      : run.conclusion === "SUCCESS" ? "success"
      : run.conclusion === "FAILURE" || run.conclusion === "TIMED_OUT" || run.conclusion === "STARTUP_FAILURE" ? "failure"
      : "neutral",
  }))
  const overall = computeCheckState(rollupState)
  return {
    overall: overall === "SUCCESS" ? "success" : overall === "FAILURE" ? "failure" : overall === "PENDING" ? "pending" : "neutral",
    checks,
  }
}
