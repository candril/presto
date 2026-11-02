import { describe, expect, test } from "bun:test"
import { relocateSelection } from "./useStickySelection"
import type { PR } from "../types"

const pr = (n: number) => ({ url: `https://github.com/o/r/pull/${n}` }) as PR
const anchor = (n: number, index: number, context = "tab\0") => ({ url: pr(n).url, index, context })

describe("relocateSelection", () => {
  test("follows the PR when a refresh pushes another one above it", () => {
    expect(relocateSelection(anchor(2, 1), [pr(3), pr(1), pr(2)], 1, "tab\0")).toBe(2)
  })

  test("stays when the PR under the cursor is unchanged", () => {
    expect(relocateSelection(anchor(2, 1), [pr(3), pr(2), pr(1)], 1, "tab\0")).toBeNull()
  })

  test("leaves a cursor the user moved alone", () => {
    expect(relocateSelection(anchor(2, 1), [pr(1), pr(2), pr(3)], 2, "tab\0")).toBeNull()
  })

  test("does not follow across a query change or a tab switch", () => {
    expect(relocateSelection(anchor(2, 0), [pr(1), pr(2)], 0, "tab\0author:me")).toBeNull()
    expect(relocateSelection(anchor(2, 0), [pr(1), pr(2)], 0, "other\0")).toBeNull()
  })

  test("keeps the index when the PR left the list", () => {
    expect(relocateSelection(anchor(2, 1), [pr(1), pr(3)], 1, "tab\0")).toBeNull()
  })

  test("nothing to follow before the first render", () => {
    expect(relocateSelection(null, [pr(1)], 0, "tab\0")).toBeNull()
  })
})
