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

  test("a wide list gets the gate glyphs and the Merge column in words", () => {
    expect(chooseLayout(200, v, true)).toEqual({ gates: "full", mergeWords: true })
  })

  test("the gate glyphs give way before the Merge column's words", () => {
    expect(chooseLayout(100, v, true)).toEqual({ gates: "compact", mergeWords: true })
  })

  test("a narrow list keeps the title readable with the glyph alone", () => {
    expect(chooseLayout(80, v, false)).toEqual({ gates: "compact", mergeWords: false })
  })
})
