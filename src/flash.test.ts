import { describe, expect, test } from "bun:test"
import { flashLabels, resolveFlashKey } from "./flash"

describe("flashLabels", () => {
  test("single home-row keys while they last, never the key that starts the jump", () => {
    const labels = flashLabels(25)
    expect(labels.slice(0, 4)).toEqual(["f", "j", "d", "k"])
    expect(labels.every((l) => l.length === 1)).toBe(true)
    expect(labels).not.toContain("s")
  })

  test("past 25 rows every label is two keys, so none is a prefix of another", () => {
    const labels = flashLabels(30)
    expect(labels).toHaveLength(30)
    expect(labels.every((l) => l.length === 2)).toBe(true)
    expect(new Set(labels).size).toBe(30)
  })

  test("no rows, no labels", () => {
    expect(flashLabels(0)).toEqual([])
  })
})

describe("resolveFlashKey", () => {
  const single = new Map([["a", "f"], ["b", "j"]])
  const double = new Map([["a", "ff"], ["b", "fj"]])

  test("a label's key jumps to its row", () => {
    expect(resolveFlashKey(single, "", "j")).toEqual({ type: "jump", target: "b" })
  })

  test("the first key of a two-key label waits for the second", () => {
    expect(resolveFlashKey(double, "", "f")).toEqual({ type: "narrow", input: "f" })
    expect(resolveFlashKey(double, "f", "j")).toEqual({ type: "jump", target: "b" })
  })

  test("anything that starts no label cancels", () => {
    expect(resolveFlashKey(single, "", "x")).toEqual({ type: "cancel" })
    expect(resolveFlashKey(single, "", "escape")).toEqual({ type: "cancel" })
    expect(resolveFlashKey(single, "", "1")).toEqual({ type: "cancel" })
  })
})
