/**
 * The demo's promise (spec 042): every merge verdict and every gate glyph is on screen
 * at once, so a screenshot of the list is a legend.
 */

import { describe, expect, test } from "bun:test"
import { buildFixtures, DEMO_ORG } from "./fixtures"
import { computeMergeVerdict, getPRCheckState, getRepoName, type CheckState, type MergeVerdict } from "../../types"

const open = () => buildFixtures().map((f) => f.pr).filter((pr) => pr.state === "OPEN")

describe("demo fixtures", () => {
  test("cover every merge verdict", () => {
    const verdicts = new Set(open().map((pr) => computeMergeVerdict(pr, false)))
    const all: MergeVerdict[] = ["ready", "author", "others", "machine", "auto-merge", "draft"]
    for (const verdict of all) expect(verdicts).toContain(verdict)
  })

  test("cover every check state and both behind flavours", () => {
    const prs = open()
    const checks = new Set(prs.map(getPRCheckState))
    const states: CheckState[] = ["SUCCESS", "FAILURE", "PENDING", "NONE"]
    for (const state of states) expect(checks).toContain(state)
    expect(prs.some((pr) => pr.baseSync === "behind" && pr.baseUpdateRequired)).toBe(true)
    expect(prs.some((pr) => pr.baseSync === "behind" && !pr.baseUpdateRequired)).toBe(true)
  })

  test("live only in the fictional org", () => {
    for (const { pr, preview } of buildFixtures()) {
      expect(getRepoName(pr).startsWith(`${DEMO_ORG}/`)).toBe(true)
      expect(preview.repo).toBe(getRepoName(pr))
    }
  })
})
