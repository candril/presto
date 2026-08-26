/**
 * The explained status rows (spec 039) — display truths that regressed once.
 */

import { describe, expect, test } from "bun:test"
import { buildStatusRows } from "./status"
import type { PR } from "./types"

const basePR: PR = {
  number: 1090,
  title: "t",
  author: { login: "candril" },
  url: "https://github.com/o/r/pull/1090",
  state: "OPEN",
  isDraft: false,
  createdAt: "",
  updatedAt: "",
  reviewDecision: null,
  statusCheckRollup: [],
  commentCount: 1,
  headRefOid: "sha",
  headRefName: "b",
  mergeStateStatus: "BLOCKED",
  autoMergeMethod: null,
  baseRefName: "master",
  baseSync: "up-to-date",
  baseUpdateRequired: false,
  headCommittedAt: new Date().toISOString(),
  checksQueued: false,
  unresolvedThreads: 0,
  approvedBy: [],
}

describe("the R row", () => {
  test("standing approvals with a null decision are not 'no review yet'", () => {
    // Dg.GalaxusAbos#1090: two approvals, reviewDecision null for over a day
    const rows = buildStatusRows({ ...basePR, approvedBy: ["Nasicus", "luethis"] }, false)
    const r = rows.find((row) => row.letter === "R")!
    expect(r.icon).toBe("✓")
    expect(r.text).toBe("Approved by Nasicus, luethis — GitHub reports no decision")
  })

  test("genuinely unreviewed stays 'no review yet'", () => {
    const r = buildStatusRows(basePR, false).find((row) => row.letter === "R")!
    expect(r.icon).toBe("-")
    expect(r.text).toBe("No review yet")
  })

  test("a real APPROVED decision names the approvers", () => {
    const rows = buildStatusRows(
      { ...basePR, reviewDecision: "APPROVED", approvedBy: ["arcwars", "luethis"] },
      false
    )
    expect(rows.find((row) => row.letter === "R")!.text).toBe("Approved by arcwars, luethis")
  })
})
