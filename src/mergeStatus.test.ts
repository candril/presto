import { describe, expect, test } from "bun:test"
import { buildMergeStatus, MAX_CHECK_DETAILS, type MergeStatusLine } from "./mergeStatus"
import { getMergeLabel } from "./status"
import { normalizePR, type PR, type PRPreview, type PreviewCheck } from "./types"

const pr = (over: Partial<PR> = {}): PR =>
  normalizePR({
    number: 1090,
    title: "t",
    url: "https://github.com/o/r/pull/1090",
    mergeStateStatus: "BLOCKED",
    baseRefName: "master",
    baseSync: "up-to-date",
    headCommittedAt: new Date().toISOString(),
    ...over,
  })

const preview = (over: Partial<PRPreview> = {}): PRPreview => ({
  repo: "o/r",
  number: 1090,
  title: "t",
  state: "OPEN",
  isDraft: false,
  files: [],
  additions: 0,
  deletions: 0,
  commits: [],
  author: { login: "a", createdAt: "" },
  reviews: [],
  requestedReviewers: [],
  checks: { overall: "success", checks: [] },
  body: "",
  baseRef: "master",
  headRef: "b",
  mergeable: "MERGEABLE",
  commentCount: 0,
  reviewCommentCount: 0,
  recentComments: [],
  behindBy: 0,
  ...over,
})

const line = (p: PR, pv: PRPreview | null, label: string): MergeStatusLine =>
  buildMergeStatus(p, pv, false).lines.find((l) => l.label === label)!

const checks = (...statuses: Array<PreviewCheck["status"]>): PRPreview["checks"] => ({
  overall: "neutral",
  checks: statuses.map((status, i) => ({ name: `check-${i}`, status })),
})

describe("Merge column label", () => {
  test("names the blocker, not just whose move it is", () => {
    expect(getMergeLabel(pr({ mergeStateStatus: "DIRTY" }), false).text).toBe("conflicts")
    expect(getMergeLabel(pr({ mergeStateStatus: "BEHIND" }), false).text).toBe("behind master")
    expect(getMergeLabel(pr({ unresolvedThreads: 3 }), false).text).toBe("3 threads")
    expect(getMergeLabel(pr({ mergeStateStatus: "CLEAN" }), false).text).toBe("ready")
  })

  test("running CI shows how far it got", () => {
    const running = pr({
      statusCheckRollup: [{ __typename: "StatusContext", name: "Overall", status: "IN_PROGRESS", conclusion: null }],
      checkCounts: { total: 8, passed: 5, failed: 0, running: 3 },
    })
    expect(getMergeLabel(running, false).text).toBe("CI 5/8")
  })

  test("a queued PR says where it stands in line", () => {
    const queued = pr({
      autoMergeMethod: "squash",
      mergeQueue: { position: 2, state: "AWAITING_CHECKS", estimatedTimeToMerge: 170, enqueuedAt: null, enqueuer: null },
    })
    const label = getMergeLabel(queued, false)
    expect(label.icon).toBe("⧗")
    expect(label.text).toBe("queue #2 ~3m")
  })

  test("unmergeable in the queue is the author's move", () => {
    const stuck = pr({ mergeQueue: { position: 1, state: "UNMERGEABLE", estimatedTimeToMerge: null, enqueuedAt: null, enqueuer: null } })
    expect(getMergeLabel(stuck, false).icon).toBe("!")
  })

  test("a draft stays blank: the state column already says draft", () => {
    expect(getMergeLabel(pr({ isDraft: true }), false).text).toBe("")
  })
})

describe("Merge status section", () => {
  test("standing approvals with a null decision count as approved", () => {
    // Dg.GalaxusAbos#1090: two approvals, reviewDecision null for over a day
    const reviews = line(pr({ approvedBy: ["Nasicus", "luethis"] }), preview(), "Reviews")
    expect(reviews.state).toBe("ok")
    expect(reviews.text).toBe("2 approvals by Nasicus, luethis")
  })

  test("reviews name who requested changes and who is still asked", () => {
    const reviews = line(
      pr({ reviewDecision: "CHANGES_REQUESTED" }),
      preview({ reviews: [{ author: "kai", state: "CHANGES_REQUESTED", submittedAt: "" }], requestedReviewers: ["sofia"] }),
      "Reviews"
    )
    expect(reviews.state).toBe("failing")
    expect(reviews.text).toBe("no approvals · changes requested by kai · waiting on sofia")
  })

  test("all green checks are one line with nothing under it", () => {
    const c = line(pr(), preview({ checks: checks("success", "success", "neutral") }), "Checks")
    expect(c).toMatchObject({ state: "ok", text: "3/3 passed" })
    expect(c.details).toBeUndefined()
  })

  test("failing checks are named, failing before running", () => {
    const c = line(pr(), preview({ checks: checks("success", "pending", "failure", "failure", "failure") }), "Checks")
    expect(c.state).toBe("failing")
    expect(c.text).toBe("1/5 · check-2, check-3 +1 failing")
    expect(c.details!.map((d) => d.state)).toEqual(["failing", "failing", "failing", "pending"])
  })

  test("a red check GitHub still lets through only warns", () => {
    const c = line(pr({ mergeStateStatus: "UNSTABLE" }), preview({ checks: checks("success", "failure") }), "Checks")
    expect(c.state).toBe("warning")
    expect(c.text.endsWith("(optional)")).toBe(true)
  })

  test("a long list of red checks is capped", () => {
    const many = Array.from({ length: MAX_CHECK_DETAILS + 3 }, () => "failure" as const)
    const c = line(pr(), preview({ checks: checks(...many) }), "Checks")
    expect(c.details).toHaveLength(MAX_CHECK_DETAILS + 1)
    expect(c.details!.at(-1)!.text).toBe("+3 more")
  })

  test("base shows the compare's count, failing only where up-to-date is required", () => {
    expect(line(pr({ baseSync: "behind" }), preview({ behindBy: 1 }), "Base")).toMatchObject({
      state: "warning",
      text: "1 commit behind master",
    })
    expect(line(pr({ baseSync: "behind", baseUpdateRequired: true }), preview({ behindBy: 4 }), "Base").state).toBe("failing")
    expect(line(pr({ baseSync: "unknown" }), preview({ behindBy: null }), "Base").state).toBe("info")
  })

  test("branch protection is named only when nothing else explains the block", () => {
    const blocked = pr({ reviewDecision: "APPROVED", approvedBy: ["kai"] })
    expect(line(blocked, preview({ checks: checks("success") }), "Blockers").text).toBe("blocked by branch protection")
    expect(line(blocked, preview({ checks: checks("failure") }), "Blockers").text).toBe("none")
  })

  test("the queue line appears only while queued", () => {
    expect(line(pr(), preview(), "Queue")).toBeUndefined()
    const queued = pr({ mergeQueue: { position: 1, state: "AWAITING_CHECKS", estimatedTimeToMerge: 180, enqueuedAt: null, enqueuer: "candril" } })
    expect(line(queued, preview(), "Queue").text).toBe("#1 · awaiting checks · ~3m · added by candril")
  })

  test("a merged PR shows its state instead of the gates", () => {
    const status = buildMergeStatus(pr({ state: "MERGED" }), preview(), false)
    expect(status.header.text).toBe("Merged")
    expect(status.lines).toEqual([])
  })
})
