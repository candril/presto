/**
 * Which page a PR's CI trouble should send you to, and which runs are worth re-running.
 *
 * Fixtures are real `gh pr view --json statusCheckRollup` and `actions/runs` payloads from
 * the PRs that motivated these actions.
 */

import { describe, expect, test } from "bun:test"
import { chooseChecksTarget, rerunNeedsFullRun, selectRerunnableRuns, type RollupEntry } from "./checks"
import type { PR } from "../types"

const pr = {
  number: 1090,
  url: "https://github.com/DigitecGalaxus/Dg.GalaxusAbos/pull/1090",
  headRefName: "fix/OSA-61979-http2-to-aax",
} as PR

// Dg.GalaxusAbos#1090: one red required check among six green ones
const oneFailing: RollupEntry[] = [
  {
    name: "Pull Request Validation / Build and Test",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://github.com/DigitecGalaxus/Dg.GalaxusAbos/actions/runs/32994328964/job/98259498615",
  },
  { name: "Security Scan", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://x/1" },
  { name: "Preview Build", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://x/2" },
  { name: "Ask Copilot", status: "COMPLETED", conclusion: "SKIPPED", detailsUrl: "https://x/3" },
]

describe("chooseChecksTarget", () => {
  test("a single red check deep-links to its job, no hunting", () => {
    const target = chooseChecksTarget(pr, oneFailing)
    expect(target.url).toBe(
      "https://github.com/DigitecGalaxus/Dg.GalaxusAbos/actions/runs/32994328964/job/98259498615"
    )
    expect(target.message).toContain("Build and Test")
  })

  test("several red checks go to the checks tab, which lists them together", () => {
    const target = chooseChecksTarget(pr, [
      ...oneFailing,
      { name: "Other", status: "COMPLETED", conclusion: "TIMED_OUT", detailsUrl: "https://x/4" },
    ])
    expect(target.url).toBe(`${pr.url}/checks`)
    expect(target.message).toContain("2 failing")
  })

  test("no checks at all opens the branch's workflow runs, not an empty checks tab", () => {
    // Dg.GalaxusAbos#1114: BLOCKED with zero check runs; the queued runs live on Actions
    const target = chooseChecksTarget(pr, [])
    expect(target.url).toContain("/actions?query=")
    expect(target.url).toContain(encodeURIComponent("branch:fix/OSA-61979-http2-to-aax"))
  })

  test("green checks still open the checks tab, where re-run lives", () => {
    const target = chooseChecksTarget(pr, [oneFailing[1]])
    expect(target.url).toBe(`${pr.url}/checks`)
    expect(target.message).toContain("none failing")
  })

  test("a legacy status context uses state and targetUrl", () => {
    const target = chooseChecksTarget(pr, [{ context: "ci/legacy", state: "FAILURE", targetUrl: "https://legacy/build" }])
    expect(target.url).toBe("https://legacy/build")
    expect(target.message).toContain("ci/legacy")
  })

  test("no checks and no branch name is reported, not guessed at", () => {
    const target = chooseChecksTarget({ ...pr, headRefName: null } as PR, [])
    expect(target.url).toBeNull()
  })
})

describe("selectRerunnableRuns", () => {
  test("picks runs that ended badly, ignores green and still-running ones", () => {
    const runs = [
      { id: 1, conclusion: "failure" },
      { id: 2, conclusion: "success" },
      { id: 3, conclusion: "startup_failure" },
      { id: 4, conclusion: null, status: "queued" },
      { id: 5, conclusion: "cancelled" },
      { id: 6, conclusion: "timed_out" },
    ]
    expect(selectRerunnableRuns(runs).map((r) => r.id)).toEqual([1, 3, 5, 6])
  })

  test("runs without failed jobs need a full re-run, not --failed", () => {
    expect(rerunNeedsFullRun({ id: 1, conclusion: "startup_failure" })).toBe(true)
    // #1114's Security run: cancelled while still queued, zero jobs ever created
    expect(rerunNeedsFullRun({ id: 2, conclusion: "cancelled" })).toBe(true)
    expect(rerunNeedsFullRun({ id: 3, conclusion: "failure" })).toBe(false)
    expect(rerunNeedsFullRun({ id: 4, conclusion: "timed_out" })).toBe(false)
  })
})
