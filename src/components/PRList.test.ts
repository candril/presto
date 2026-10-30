import { describe, expect, test } from "bun:test"
import { chooseLayout, dropTrailingCells } from "./PRList"
import { defaultColumnVisibility } from "../cache"

describe("dropTrailingCells", () => {
  const lead = [{ text: "• " }, { text: "3h  " }, { text: " " }]

  test("a one-key label takes only the separator before the title", () => {
    expect(dropTrailingCells(lead, 1)).toEqual([{ text: "• " }, { text: "3h  " }])
  })

  test("a two-key label also takes the time column's last cell", () => {
    expect(dropTrailingCells(lead, 2)).toEqual([{ text: "• " }, { text: "3h " }])
  })

  test("leaves the input alone", () => {
    dropTrailingCells(lead, 2)
    expect(lead).toHaveLength(3)
  })
})

describe("chooseLayout", () => {
  const v = defaultColumnVisibility

  test("a wide list gets the gate glyphs it asks for", () => {
    expect(chooseLayout(200, v, true)).toEqual({ gates: "full" })
  })

  test("the gate glyphs give way before the title does", () => {
    expect(chooseLayout(80, v, true)).toEqual({ gates: "compact" })
  })

  test("collapsed stays collapsed however wide", () => {
    expect(chooseLayout(200, v, false)).toEqual({ gates: "compact" })
  })
})
