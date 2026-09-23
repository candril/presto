import { describe, expect, test } from "bun:test"
import { filterNamesRepo } from "./repoFilter"

describe("filterNamesRepo", () => {
  test("a fragment matches anywhere in the name", () => {
    expect(filterNamesRepo("api", "acme/api-gateway")).toBe(true)
  })

  test("a full owner/name matches only that repo, whatever the case", () => {
    expect(filterNamesRepo("acme/api", "acme/api-gateway")).toBe(false)
    expect(filterNamesRepo("acme/api", "Acme/API")).toBe(true)
  })
})
