import { describe, expect, test } from "bun:test"
import { appReducer, createInitialState } from "./state"
import { normalizePR } from "./types"
import type { PR } from "./types"

const pr = (number: number, over: Partial<PR> = {}): PR =>
  normalizePR({
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/web/pull/${number}`,
    state: "OPEN",
    updatedAt: "2026-09-20T10:00:00Z",
    author: { login: "candril", name: null },
    ...over,
  } as PR)

const withPRs = (prs: PR[]) => appReducer(createInitialState(), { type: "SET_PRS", prs })

describe("APPEND_PRS", () => {
  test("adds PRs that are not in the list, newest first", () => {
    const state = appReducer(withPRs([pr(1)]), {
      type: "APPEND_PRS",
      prs: [pr(2, { updatedAt: "2026-09-22T10:00:00Z" })],
    })
    expect(state.prs.map((p) => p.number)).toEqual([2, 1])
  })

  test("a later reading of a PR replaces the one held", () => {
    const open = withPRs([pr(1)])
    const state = appReducer(open, {
      type: "APPEND_PRS",
      prs: [pr(1, { state: "MERGED", updatedAt: "2026-09-22T09:42:00Z" })],
    })
    expect(state.prs).toHaveLength(1)
    expect(state.prs[0]!.state).toBe("MERGED")
  })

  test("an older reading does not overwrite a newer one", () => {
    const current = withPRs([pr(1, { title: "current", updatedAt: "2026-09-22T10:00:00Z" })])
    const state = appReducer(current, {
      type: "APPEND_PRS",
      prs: [pr(1, { title: "stale", updatedAt: "2026-09-01T10:00:00Z" })],
    })
    expect(state.prs[0]!.title).toBe("current")
  })

  test("nothing new keeps the same state object, so nothing re-renders", () => {
    const before = withPRs([pr(1)])
    const after = appReducer(before, { type: "APPEND_PRS", prs: [pr(1)] })
    expect(after.prs[0]!.state).toBe("OPEN")
    expect(after.prs).toHaveLength(1)
  })
})

describe("REMOVE_PRS", () => {
  test("drops the named PRs and leaves the rest", () => {
    const before = withPRs([pr(1), pr(2), pr(3)])
    const after = appReducer(before, { type: "REMOVE_PRS", urls: [pr(2).url] })
    expect(after.prs.map((p) => p.number).sort()).toEqual([1, 3])
  })

  test("the cursor cannot be left past the end of the list", () => {
    const before = appReducer(withPRs([pr(1), pr(2), pr(3)]), { type: "SELECT", index: 2 })
    const after = appReducer(before, { type: "REMOVE_PRS", urls: [pr(2).url, pr(3).url] })
    expect(after.selectedIndex).toBe(0)
  })

  test("removing nothing, or something absent, is the same state", () => {
    const before = withPRs([pr(1)])
    expect(appReducer(before, { type: "REMOVE_PRS", urls: [] })).toBe(before)
    expect(appReducer(before, { type: "REMOVE_PRS", urls: ["https://example.com/x"] })).toBe(before)
  })
})
