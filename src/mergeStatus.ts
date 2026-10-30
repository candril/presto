/**
 * The preview's "Merge status" section (spec 053): the verdict, then one line per gate
 * GitHub applies, so nothing hides behind the first thing that blocks.
 *
 * Pure, and built from the list row plus the preview fetch: the row carries what the
 * verdict is computed from, so the header always says what the Merge column says.
 */

import { theme } from "./theme"
import { getMergeIndicator, getStateIndicator, type StatusIndicator } from "./status"
import type { MergeVerdict, PR, PRPreview, PreviewCheck } from "./types"
import { computeMergeVerdictDetail, describeQueueState, formatEta, getCheckCounts } from "./types"
import { formatCompactTime } from "./utils/time"

export type LineState = "ok" | "warning" | "failing" | "pending" | "info" | "none"

export interface MergeStatusLine {
  label: string
  state: LineState
  text: string
  /** Overrides the state's icon and colour (the queue's ⧗) */
  indicator?: StatusIndicator
  /** Indented under the line: the checks that are not green */
  details?: Array<{ state: LineState; text: string }>
}

export interface MergeStatus {
  header: StatusIndicator & { text: string }
  lines: MergeStatusLine[]
}

const LINE_STYLE: Record<LineState, StatusIndicator> = {
  ok: { icon: "✓", color: theme.success },
  warning: { icon: "⚠", color: theme.warning },
  failing: { icon: "✗", color: theme.error },
  pending: { icon: "○", color: theme.textDim },
  info: { icon: "ℹ", color: theme.primary },
  none: { icon: "-", color: theme.textMuted },
}

export function lineStyle(line: { state: LineState; indicator?: StatusIndicator }): StatusIndicator {
  return line.indicator ?? LINE_STYLE[line.state]
}

/** Failing and running checks listed under the line, beyond which "+N more" */
export const MAX_CHECK_DETAILS = 8

const VERDICT_PREFIX: Partial<Record<MergeVerdict, string>> = {
  author: "Author's move — ",
  others: "Waiting on others — ",
  machine: "Machine's move — ",
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`

/** Names joined, at most `max`, the rest as "+N" */
function nameList(names: string[], max: number): string {
  const shown = names.slice(0, max).join(", ")
  return names.length > max ? `${shown} +${names.length - max}` : shown
}

export function buildMergeStatus(pr: PR, preview: PRPreview | null, hasPendingAction: boolean): MergeStatus {
  if (pr.state !== "OPEN") {
    return {
      header: { ...getStateIndicator(pr), text: pr.state === "MERGED" ? "Merged" : "Closed" },
      lines: [],
    }
  }

  const detail = computeMergeVerdictDetail(pr, hasPendingAction)
  const lines = [
    checksLine(pr, preview),
    reviewsLine(pr, preview),
    conversationsLine(pr),
    conflictsLine(pr, preview),
    baseLine(pr, preview),
    queueLine(pr),
    blockersLine(pr, preview),
  ].filter((line): line is MergeStatusLine => line !== null)

  return {
    header: {
      ...getMergeIndicator(detail.verdict, pr.mergeQueue),
      text: `${VERDICT_PREFIX[detail.verdict] ?? ""}${capitalize(detail.reason)}`,
    },
    lines,
  }
}

/**
 * From the preview's check list when it has one — names, and fetched just now — else from
 * the row's counts. A failure only warns when GitHub still offers the merge (UNSTABLE):
 * `gh pr view` does not say which checks are required, but GitHub's verdict does.
 */
function checksLine(pr: PR, preview: PRPreview | null): MergeStatusLine {
  const checks: PreviewCheck[] = preview?.checks.checks ?? []
  const counts = checks.length > 0
    ? {
        total: checks.length,
        passed: checks.filter((c) => c.status === "success" || c.status === "neutral").length,
        failed: checks.filter((c) => c.status === "failure").length,
        running: checks.filter((c) => c.status === "pending").length,
      }
    : getCheckCounts(pr)
  const failing = checks.filter((c) => c.status === "failure").map((c) => c.name)
  const running = checks.filter((c) => c.status === "pending").map((c) => c.name)

  if (counts.total === 0) {
    return pr.checksQueued
      ? { label: "Checks", state: "pending", text: "queued — none started yet" }
      : { label: "Checks", state: "none", text: "no checks" }
  }

  const tally = `${counts.passed}/${counts.total}`
  const notGreen = [
    ...failing.map((name) => ({ state: "failing" as const, text: name })),
    ...running.map((name) => ({ state: "pending" as const, text: name })),
  ]
  const details = notGreen.length > MAX_CHECK_DETAILS
    ? [...notGreen.slice(0, MAX_CHECK_DETAILS), { state: "none" as const, text: `+${notGreen.length - MAX_CHECK_DETAILS} more` }]
    : notGreen

  if (counts.failed > 0) {
    const optional = pr.mergeStateStatus === "UNSTABLE"
    const names = failing.length > 0 ? ` · ${nameList(failing, 2)}` : ""
    return {
      label: "Checks",
      state: optional ? "warning" : "failing",
      text: `${tally}${names} failing${optional ? " (optional)" : ""}`,
      details,
    }
  }
  if (counts.running > 0) {
    return { label: "Checks", state: "pending", text: `${tally} · ${counts.running} running`, details }
  }
  return { label: "Checks", state: "ok", text: `${tally} passed` }
}

/**
 * Approvals from the row's latest opinionated reviews: the preview keeps each reviewer's
 * latest review of any kind, so a comment after an approval would hide the approval.
 */
function reviewsLine(pr: PR, preview: PRPreview | null): MergeStatusLine {
  const approvals = pr.approvedBy
  const changesBy = (preview?.reviews ?? []).filter((r) => r.state === "CHANGES_REQUESTED").map((r) => r.author)
  const waitingOn = preview?.requestedReviewers ?? []

  const parts = [approvals.length > 0 ? `${plural(approvals.length, "approval")} by ${approvals.join(", ")}` : "no approvals"]
  if (changesBy.length > 0) parts.push(`changes requested by ${changesBy.join(", ")}`)
  if (waitingOn.length > 0) parts.push(`waiting on ${waitingOn.join(", ")}`)
  const text = parts.join(" · ")

  if (pr.reviewDecision === "CHANGES_REQUESTED" || changesBy.length > 0) return { label: "Reviews", state: "failing", text }
  if (pr.reviewDecision === "REVIEW_REQUIRED") return { label: "Reviews", state: "warning", text }
  // GitHub's decision can be null while approvals stand (spec 039): they still count
  if (pr.reviewDecision === "APPROVED" || approvals.length > 0) return { label: "Reviews", state: "ok", text }
  return { label: "Reviews", state: "none", text }
}

/** Open threads only block when GitHub says the PR is blocked; otherwise they are a nudge */
function conversationsLine(pr: PR): MergeStatusLine {
  if (pr.unresolvedThreads === 0) return { label: "Conversations", state: "ok", text: "all resolved" }
  return {
    label: "Conversations",
    state: pr.mergeStateStatus === "BLOCKED" ? "failing" : "warning",
    text: `${pr.unresolvedThreads} unresolved`,
  }
}

function conflictsLine(pr: PR, preview: PRPreview | null): MergeStatusLine {
  if (pr.mergeStateStatus === "DIRTY" || preview?.mergeable === "CONFLICTING") {
    return { label: "Conflicts", state: "failing", text: "conflicting" }
  }
  if (pr.mergeStateStatus === "UNKNOWN" || preview?.mergeable === "UNKNOWN") {
    return { label: "Conflicts", state: "pending", text: "checking" }
  }
  return { label: "Conflicts", state: "ok", text: "no conflicts" }
}

/**
 * The compare's count when it ran; the row's reading of GitHub otherwise. Behind is
 * failing only where the base requires an up-to-date branch, else it is optional.
 */
function baseLine(pr: PR, preview: PRPreview | null): MergeStatusLine {
  const base = pr.baseRefName ?? preview?.baseRef ?? "base"
  const behindState: LineState = pr.baseUpdateRequired ? "failing" : "warning"
  const behindBy = preview?.behindBy ?? null

  if (behindBy !== null) {
    if (behindBy === 0) return { label: "Base", state: "ok", text: `up to date with ${base}` }
    return { label: "Base", state: behindState, text: `${plural(behindBy, "commit")} behind ${base}` }
  }
  switch (pr.baseSync) {
    case "behind":
      return { label: "Base", state: behindState, text: `behind ${base}` }
    case "up-to-date":
      return { label: "Base", state: "ok", text: `up to date with ${base}` }
    default:
      return { label: "Base", state: "info", text: `could not compare with ${base}` }
  }
}

function queueLine(pr: PR): MergeStatusLine | null {
  const entry = pr.mergeQueue
  if (!entry) return null
  const parts = [`#${entry.position}`, describeQueueState(entry.state)]
  if (entry.estimatedTimeToMerge !== null) parts.push(formatEta(entry.estimatedTimeToMerge))
  if (entry.enqueuer) {
    parts.push(`added by ${entry.enqueuer}${entry.enqueuedAt ? ` ${formatCompactTime(entry.enqueuedAt)} ago` : ""}`)
  }
  const unmergeable = entry.state === "UNMERGEABLE"
  return {
    label: "Queue",
    state: unmergeable ? "failing" : "info",
    text: parts.join(" · "),
    indicator: unmergeable ? undefined : getMergeIndicator("queued", entry),
  }
}

/**
 * What blocks the merge besides the gates above. Branch protection is named only when
 * nothing above explains GitHub's BLOCKED: it is the residue, not a reason of its own.
 */
function blockersLine(pr: PR, preview: PRPreview | null): MergeStatusLine {
  const blockers: Array<{ state: LineState; text: string }> = []
  if (pr.isDraft) blockers.push({ state: "failing", text: "draft" })

  const explained = [checksLine(pr, preview), reviewsLine(pr, preview), conversationsLine(pr), conflictsLine(pr, preview), baseLine(pr, preview)]
    .some((line) => line.state === "failing" || line.state === "pending" || (line.label === "Reviews" && line.state === "warning"))
  if (pr.mergeStateStatus === "BLOCKED" && !pr.isDraft && !pr.mergeQueue && !explained) {
    blockers.push({ state: "failing", text: "blocked by branch protection" })
  }
  if (pr.mergeStateStatus === "UNKNOWN") blockers.push({ state: "pending", text: "GitHub is still computing the merge state" })
  if (pr.autoMergeMethod) blockers.push({ state: "info", text: `auto-merge armed (${pr.autoMergeMethod})` })

  if (blockers.length === 0) return { label: "Blockers", state: "ok", text: "none" }
  const rank: LineState[] = ["failing", "warning", "pending", "info"]
  const state = rank.find((candidate) => blockers.some((b) => b.state === candidate)) ?? "info"
  return { label: "Blockers", state, text: blockers.map((b) => b.text).join(" · ") }
}
