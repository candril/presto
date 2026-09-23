import { describe, expect, test } from "bun:test"
import type { Repository } from "../config"
import type { History } from "../history"
import type { PR } from "../types"
import { buildSuggestions } from "./DiscoverySuggestions"

const history = { visitedRepos: [], starredAuthors: [], recentlyViewed: [], markedPRs: {} } as unknown as History
const pr = (repo: string, number: number) =>
  ({ number, url: `https://github.com/${repo}/pull/${number}`, author: { login: "alice" } }) as PR
const repos = [
  { name: "acme/api" },
  { name: "acme/web" },
  { name: "acme/legacy", disabled: true },
] as Repository[]

const repoValues = (query: string, prs: PR[]) =>
  buildSuggestions(query, history, prs, repos)
    .filter((s) => s.type === "repo")
    .map((s) => ({ value: s.value, count: s.count }))

describe("repo: suggestions", () => {
  test("an enabled repo with no PRs loaded is still offered", () => {
    expect(repoValues("repo:", [pr("acme/api", 1)])).toEqual([
      { value: "repo:acme/api", count: 1 },
      { value: "repo:acme/web", count: 0 },
      { value: "repo:acme/legacy", count: undefined },
    ])
  })

  test("GitHub's casing of a configured repo does not list it twice or lose its count", () => {
    expect(repoValues("repo:ap", [pr("Acme/API", 1), pr("Acme/API", 2)])).toEqual([
      { value: "repo:acme/api", count: 2 },
    ])
  })

  test("free text finds a configured repo with nothing loaded", () => {
    expect(repoValues("web", [])).toEqual([{ value: "repo:acme/web", count: 0 }])
  })
})
