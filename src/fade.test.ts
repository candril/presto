import { describe, expect, test } from "bun:test"
import { fade, fadeLevel, type FadeSettings } from "./fade"

const SETTINGS: FadeSettings = { afterDays: 21, floor: 0.4 }
const NOW = Date.parse("2026-09-22T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()

describe("fadeLevel", () => {
  test("a fresh row is untouched", () => {
    expect(fadeLevel(daysAgo(0), SETTINGS, NOW)).toBe(1)
    expect(fadeLevel(daysAgo(20.9), SETTINGS, NOW)).toBe(1)
  })

  test("past the threshold it drops to the middle step", () => {
    expect(fadeLevel(daysAgo(21), SETTINGS, NOW)).toBe(0.7)
    expect(fadeLevel(daysAgo(41), SETTINGS, NOW)).toBe(0.7)
  })

  test("past twice the threshold it sits on the floor", () => {
    expect(fadeLevel(daysAgo(42), SETTINGS, NOW)).toBe(0.4)
    expect(fadeLevel(daysAgo(365), SETTINGS, NOW)).toBe(0.4)
  })

  test("afterDays 0 turns the fade off", () => {
    expect(fadeLevel(daysAgo(365), { afterDays: 0, floor: 0.4 }, NOW)).toBe(1)
  })

  test("a missing or unreadable timestamp is not treated as old", () => {
    expect(fadeLevel(null, SETTINGS, NOW)).toBe(1)
    expect(fadeLevel("not a date", SETTINGS, NOW)).toBe(1)
  })

  test("a timestamp in the future does not fade", () => {
    expect(fadeLevel(daysAgo(-5), SETTINGS, NOW)).toBe(1)
  })
})

describe("fade", () => {
  test("level 1 returns the colour untouched", () => {
    expect(fade("#c0caf5", 1)).toBe("#c0caf5")
  })

  test("level 0 is the background", () => {
    expect(fade("#ffffff", 0, "#1a1b26")).toBe("#1a1b26")
  })

  test("halfway is halfway", () => {
    expect(fade("#ffffff", 0.5, "#000000")).toBe("#808080")
  })

  test("short hex and an alpha suffix both parse", () => {
    expect(fade("#fff", 0.5, "#000")).toBe("#808080")
    expect(fade("#ffffff80", 0.5, "#000000")).toBe("#808080")
  })

  test("a colour it cannot read comes back unchanged", () => {
    expect(fade("rebeccapurple", 0.5)).toBe("rebeccapurple")
  })
})
