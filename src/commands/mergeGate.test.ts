/**
 * The merge dialog's gate (spec 040): what actually decides whether GitHub would take
 * the merge, and how fresh REST state maps back onto the row vocabulary.
 *
 * Motivating PR: Dg.GalaxusAbos#1114 — approved, checks green, `mergeable: true`, yet
 * unmergeable, first as "unknown" while GitHub recomputed, then as "behind".
 */

import { describe, expect, test } from "bun:test"
import { isMergeableState, mergeableStateToStatus } from "../actions/merge"

describe("isMergeableState", () => {
  test("only states GitHub would actually take", () => {
    expect(isMergeableState("clean")).toBe(true)
    expect(isMergeableState("unstable")).toBe(true)
    expect(isMergeableState("has_hooks")).toBe(true)
  })

  test("mergeable:true is not enough — behind and blocked still fail the merge call", () => {
    for (const state of ["behind", "blocked", "dirty", "draft", "unknown"]) {
      expect(isMergeableState(state)).toBe(false)
    }
  })
})

describe("mergeableStateToStatus", () => {
  test("maps REST vocabulary onto the row vocabulary", () => {
    expect(mergeableStateToStatus("behind")).toBe("BEHIND")
    expect(mergeableStateToStatus("clean")).toBe("CLEAN")
    expect(mergeableStateToStatus("blocked")).toBe("BLOCKED")
    expect(mergeableStateToStatus("unknown")).toBe("UNKNOWN")
  })

  test("an unrecognised state corrects nothing rather than guessing", () => {
    expect(mergeableStateToStatus("some_new_state")).toBeNull()
  })
})
