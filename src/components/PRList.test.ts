import { describe, expect, test } from "bun:test"
import { dropTrailingCells } from "./PRList"

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
