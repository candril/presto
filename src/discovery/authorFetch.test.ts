import { describe, expect, test } from "bun:test"
import { claimAuthorFetch, planAuthorFetches, releaseAuthorFetch } from "./authorFetch"

const ENABLED = ["DigitecGalaxus/isomorph", "DigitecGalaxus/Dg.GalaxusAbos"]
const ALL = [...ENABLED, "candril/presto"]

const plan = (over: Partial<Parameters<typeof planAuthorFetches>[0]> = {}) =>
  planAuthorFetches({
    authors: ["candril"],
    states: [],
    repoFilters: [],
    enabledRepos: ENABLED,
    allRepos: ALL,
    fetched: new Map(),
    ...over,
  })

describe("planAuthorFetches", () => {
  test("asks every enabled repo about the author", () => {
    expect(plan().map((f) => f.repo)).toEqual(ENABLED)
  })

  test("no author filter is nothing to fetch", () => {
    expect(plan({ authors: [] })).toEqual([])
  })

  test("a repo filter narrows the fetch, and reaches repos that are hidden by default", () => {
    const fetches = plan({ repoFilters: ["presto"] })
    expect(fetches.map((f) => f.repo)).toEqual(["candril/presto"])
  })

  test("a full owner/name asks only that repo, not every repo it is a prefix of", () => {
    const fetches = plan({
      repoFilters: ["candril/presto"],
      allRepos: [...ALL, "candril/presto-docs"],
    })
    expect(fetches.map((f) => f.repo)).toEqual(["candril/presto"])
  })

  test("state:merged is left to the closed/merged backfill", () => {
    expect(plan({ states: ["merged"] })).toEqual([])
    expect(plan({ states: ["closed"] })).toEqual([])
  })

  test("state:open is still an open-PR fetch", () => {
    expect(plan({ states: ["open"] })).toHaveLength(ENABLED.length)
  })

  test("a repo already fetched for that author is not asked again", () => {
    const fetched = new Map([["candril", new Set(["digitecgalaxus/isomorph"])]])
    expect(plan({ fetched }).map((f) => f.repo)).toEqual(["DigitecGalaxus/Dg.GalaxusAbos"])
  })

  test("the claim is per author: one person's fetch does not cover another's", () => {
    const fetched = new Map([["candril", new Set(["digitecgalaxus/isomorph"])]])
    expect(plan({ authors: ["luethis"], fetched })).toHaveLength(ENABLED.length)
  })

  test("several authors each get their own repos", () => {
    const fetches = plan({ authors: ["candril", "luethis"] })
    expect(fetches).toHaveLength(ENABLED.length * 2)
    expect(new Set(fetches.map((f) => f.author))).toEqual(new Set(["candril", "luethis"]))
  })
})

describe("claims", () => {
  test("a claim survives a re-plan, and releasing it brings the repo back", () => {
    const fetched = new Map<string, Set<string>>()
    claimAuthorFetch(fetched, "candril", "digitecgalaxus/isomorph")
    expect(plan({ fetched })).toHaveLength(1)

    releaseAuthorFetch(fetched, "candril", "digitecgalaxus/isomorph")
    expect(plan({ fetched })).toHaveLength(2)
  })

  test("releasing something never claimed is not an error", () => {
    expect(() => releaseAuthorFetch(new Map(), "nobody", "repo")).not.toThrow()
  })
})
