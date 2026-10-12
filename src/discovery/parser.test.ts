import { describe, expect, test } from "bun:test"
import type { PR } from "../types"
import { applyFilter, parseFilter } from "./parser"

const pr = (repo: string, number: number, title = "") =>
  ({ number, title, state: "OPEN", isDraft: false, url: `https://github.com/${repo}/pull/${number}`, author: { login: "alice" } }) as PR

const numbersOf = (query: string, prs: PR[]) =>
  applyFilter(prs, parseFilter(query)).map((p) => p.number)

describe("bare number", () => {
  const prs = [pr("acme/api", 123), pr("acme/web", 123), pr("acme/api", 1234, "bump to 123")]

  test("matches the PR number exactly, not titles or prefixes", () => {
    expect(numbersOf("123", prs)).toEqual([123, 123])
  })

  test("is a local filter, not a PR reference", () => {
    const filter = parseFilter("123")
    expect(filter.prRef).toBeNull()
    expect(filter.numbers).toEqual([123])
    expect(filter.text).toBe("")
  })

  test("ANDs with other tokens and ORs with other numbers", () => {
    expect(numbersOf("repo:web 123", prs)).toEqual([123])
    expect(numbersOf("123 1234", prs)).toEqual([123, 123, 1234])
  })

  test("#123 stays a PR reference", () => {
    expect(parseFilter("#123").prRef).toEqual({ number: 123 })
  })
})
