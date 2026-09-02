/**
 * Merge-verdict rules (spec 037).
 *
 * Every case here is a real PR whose status presto once got wrong. The GitHub data is
 * fabricated but taken from the live PR at the time it was reported.
 */

import { describe, expect, test } from "bun:test"
import { computeMergeVerdict, getPRCheckState, normalizePR, STALE_CHECKS_MS, type CheckState, type PR } from "./types"

const basePR: PR = {
  number: 0,
  title: "t",
  author: { login: "a" },
  url: "https://github.com/o/r/pull/0",
  state: "OPEN",
  isDraft: false,
  createdAt: "",
  updatedAt: "",
  reviewDecision: null,
  statusCheckRollup: [],
  commentCount: 0,
  openCommentCount: 0,
  headRefOid: "sha",
  headRefName: "b",
  mergeStateStatus: null,
  autoMergeMethod: null,
  baseRefName: "master",
  baseSync: "up-to-date",
  baseUpdateRequired: false,
  headCommittedAt: new Date().toISOString(),
  checksQueued: false,
  unresolvedThreads: 0,
  approvedBy: [],
}

function pr(patch: Partial<PR>): PR {
  return { ...basePR, ...patch }
}

/** A rollup reporting a single overall check, matching what the GraphQL provider builds */
function checks(state: "SUCCESS" | "FAILURE" | "PENDING"): PR["statusCheckRollup"] {
  return [
    {
      __typename: "StatusContext",
      name: "Overall",
      status: state === "PENDING" ? "IN_PROGRESS" : "COMPLETED",
      conclusion: state === "PENDING" ? null : state,
    },
  ]
}

const longAgo = new Date(Date.now() - STALE_CHECKS_MS * 2).toISOString()

describe("computeMergeVerdict", () => {
  test("a draft has no verdict, whatever GitHub claims about merging", () => {
    // isomorph#10187: GitHub reports BLOCKED / REVIEW_REQUIRED that nobody requested
    expect(
      computeMergeVerdict(
        pr({ isDraft: true, mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED", statusCheckRollup: checks("SUCCESS") }),
        false
      )
    ).toBe("draft")

    // Dg.GalaxusAbos#1106: GitHub reports CLEAN on an unapproved draft whose base
    // requires an approval — protection is not evaluated for drafts
    expect(
      computeMergeVerdict(pr({ isDraft: true, mergeStateStatus: "CLEAN", statusCheckRollup: checks("SUCCESS") }), false)
    ).toBe("draft")
  })

  test("ready only when GitHub will actually take the merge", () => {
    // Dg.GalaxusAbos#1112
    expect(
      computeMergeVerdict(pr({ mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", statusCheckRollup: checks("SUCCESS") }), false)
    ).toBe("ready")

    // UNSTABLE is mergeable: only a non-required check is red
    expect(
      computeMergeVerdict(pr({ mergeStateStatus: "UNSTABLE", reviewDecision: "APPROVED", statusCheckRollup: checks("FAILURE") }), false)
    ).toBe("ready")
  })

  test("a red build is the author's move, not a review wait", () => {
    // Dg.GalaxusAbos#1090
    expect(computeMergeVerdict(pr({ mergeStateStatus: "BLOCKED", statusCheckRollup: checks("FAILURE") }), false)).toBe("author")
  })

  test("checks that never report become the author's move once stale", () => {
    // Dg.GalaxusAbos#1114: approved and mergeable, suites queued, nothing started
    const stalled = pr({
      mergeStateStatus: "BLOCKED",
      reviewDecision: "APPROVED",
      statusCheckRollup: [],
      checksQueued: true,
      headCommittedAt: longAgo,
    })
    expect(computeMergeVerdict(stalled, false)).toBe("author")

    // the same PR moments after the push is just a slow start
    expect(computeMergeVerdict({ ...stalled, headCommittedAt: new Date().toISOString() }, false)).toBe("machine")
  })

  test("an unresolved comment thread is the author's move, not a review wait", () => {
    // Dg.GalaxusAbos#1115: a COMMENTED review left one open thread. GitHub still says
    // REVIEW_REQUIRED, but this team blocks by commenting rather than requesting changes.
    const commented = pr({
      mergeStateStatus: "BLOCKED",
      reviewDecision: "REVIEW_REQUIRED",
      statusCheckRollup: checks("SUCCESS"),
      unresolvedThreads: 1,
    })
    expect(computeMergeVerdict(commented, false)).toBe("author")

    // resolve it and, with still no approval, it goes back to awaiting review
    expect(computeMergeVerdict({ ...commented, unresolvedThreads: 0 }, false)).toBe("others")
  })

  test("an open thread blocks even a PR GitHub would merge", () => {
    expect(
      computeMergeVerdict(
        pr({ mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", statusCheckRollup: checks("SUCCESS"), unresolvedThreads: 2 }),
        false
      )
    ).toBe("author")
  })

  test("an outstanding review outranks running CI", () => {
    expect(
      computeMergeVerdict(pr({ mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED", statusCheckRollup: checks("PENDING") }), false)
    ).toBe("others")
  })

  test("machine means no human action is outstanding", () => {
    expect(
      computeMergeVerdict(pr({ mergeStateStatus: "BLOCKED", reviewDecision: "APPROVED", statusCheckRollup: checks("PENDING") }), false)
    ).toBe("machine")
  })

  test("branch state the author must clear", () => {
    expect(computeMergeVerdict(pr({ mergeStateStatus: "BEHIND", statusCheckRollup: checks("SUCCESS") }), false)).toBe("author")
    expect(computeMergeVerdict(pr({ mergeStateStatus: "DIRTY", statusCheckRollup: checks("SUCCESS") }), false)).toBe("author")
    expect(
      computeMergeVerdict(pr({ mergeStateStatus: "BLOCKED", reviewDecision: "CHANGES_REQUESTED", statusCheckRollup: checks("SUCCESS") }), false)
    ).toBe("author")
  })

  test("overrides outrank the gates, and a draft outranks even auto-merge", () => {
    expect(computeMergeVerdict(pr({ mergeStateStatus: "BLOCKED", autoMergeMethod: "squash" }), false)).toBe("auto-merge")
    expect(computeMergeVerdict(pr({ mergeStateStatus: "BEHIND" }), true)).toBe("pending-action")
    expect(computeMergeVerdict(pr({ isDraft: true, autoMergeMethod: "squash" }), false)).toBe("draft")
  })
})

describe("approval fallback (Dg.GalaxusAbos#1090)", () => {
  // Two standing approvals, reviewDecision null for over a day — GitHub's decision
  // field is not the only truth about reviews.
  test("standing approvals do not change the verdict, only the display", () => {
    const p = pr({
      mergeStateStatus: "BLOCKED",
      reviewDecision: null,
      approvedBy: ["Nasicus", "luethis"],
      statusCheckRollup: checks("SUCCESS"),
      unresolvedThreads: 1,
    })
    // the open thread still owns the verdict (thread resolution is formally required)
    expect(computeMergeVerdict(p, false)).toBe("author")
  })
})

describe("normalizePR", () => {
  // The on-disk cache stores whole PR objects, so a PR cached before a field existed
  // comes back without it — approvedBy.length on one crashed the list at render.
  test("a PR cached before this week's fields renders without crashing", () => {
    const stale = normalizePR({
      number: 1,
      title: "old",
      url: "https://github.com/o/r/pull/1",
      author: { login: "a" },
      state: "OPEN",
    } as any)
    expect(stale.approvedBy).toEqual([])
    expect(stale.unresolvedThreads).toBe(0)
    expect(stale.baseSync).toBe("unknown")
    expect(stale.checksQueued).toBe(false)
    expect(computeMergeVerdict(stale, false)).toBeDefined()
  })

  test("fresh fields are never overwritten by the defaults", () => {
    const fresh = normalizePR(pr({ approvedBy: ["x"], unresolvedThreads: 2 }))
    expect(fresh.approvedBy).toEqual(["x"])
    expect(fresh.unresolvedThreads).toBe(2)
  })
})

describe("getPRCheckState", () => {
  test("queued suites read as pending, not as a repo without CI", () => {
    expect(getPRCheckState(pr({ statusCheckRollup: [], checksQueued: true }))).toBe("PENDING" satisfies CheckState)
    expect(getPRCheckState(pr({ statusCheckRollup: [], checksQueued: false }))).toBe("NONE" satisfies CheckState)
  })

  test("a real rollup always wins over the queued fallback", () => {
    expect(getPRCheckState(pr({ statusCheckRollup: checks("SUCCESS"), checksQueued: true }))).toBe("SUCCESS")
  })
})
