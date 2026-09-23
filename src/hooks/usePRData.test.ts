import { describe, expect, test } from "bun:test"
import type { PR } from "../types"
import { filterNamesRepo, replaceReposPRs, retainPRsFromRepos } from "./usePRData"

const pr = (repo: string, number: number) =>
  ({ number, url: `https://github.com/${repo}/pull/${number}` }) as PR

describe("replaceReposPRs", () => {
  test("a refresh narrowed to one repo leaves every other repo's PRs in place", () => {
    const held = [pr("acme/api", 1), pr("acme/web", 2), pr("acme/web", 3)]
    const next = replaceReposPRs(held, [pr("acme/api", 4)], ["acme/api"])
    expect(next.map((p) => p.url).sort()).toEqual([
      "https://github.com/acme/api/pull/4",
      "https://github.com/acme/web/pull/2",
      "https://github.com/acme/web/pull/3",
    ])
  })

  test("a PR gone from the refreshed repo is dropped, whatever the repo's case", () => {
    const next = replaceReposPRs([pr("acme/api", 1)], [], ["Acme/API"])
    expect(next).toEqual([])
  })
})

describe("retainPRsFromRepos", () => {
  test("keeps what a failed repo had and adds nothing for a repo that answered", () => {
    const held = [pr("acme/api", 1), pr("acme/web", 2)]
    const next = retainPRsFromRepos(held, [pr("acme/web", 3)], ["acme/api"])
    expect(next.map((p) => p.number).sort()).toEqual([1, 3])
  })
})

describe("filterNamesRepo", () => {
  test("a fragment matches anywhere in the name", () => {
    expect(filterNamesRepo("api", "acme/api-gateway")).toBe(true)
  })

  test("a full owner/name matches only that repo", () => {
    expect(filterNamesRepo("acme/api", "acme/api-gateway")).toBe(false)
    expect(filterNamesRepo("acme/api", "Acme/API")).toBe(true)
  })
})
