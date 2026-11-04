import { describe, expect, test } from "bun:test"
import { appReducer, createInitialState } from "./state"
import type { Tab } from "./tabs/types"
import { normalizePR } from "./types"
import type { AppState, PR } from "./types"

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

  test("a refetch puts GitHub's answer over an optimistic patch that never landed", () => {
    const patched = appReducer(withPRs([pr(1)]), {
      type: "UPDATE_PR",
      url: pr(1).url,
      updates: { state: "CLOSED" },
    })
    const state = appReducer(patched, { type: "APPEND_PRS", prs: [pr(1)] })
    expect(state.prs[0]!.state).toBe("OPEN")
  })

  test("a refetch showing the new head commit settles a branch-update marker", () => {
    const pending = appReducer(withPRs([pr(1, { headRefOid: "old" })]), {
      type: "SET_PR_PENDING",
      prKey: "acme/web#1",
      kind: "update-branch",
      firedAt: Date.now(),
    })
    const state = appReducer(pending, {
      type: "APPEND_PRS",
      prs: [pr(1, { headRefOid: "new", updatedAt: "2026-09-20T10:05:00Z" })],
    })
    expect(state.pendingActions).toEqual({})
  })

  test("nothing new keeps the same state object, so nothing re-renders", () => {
    const before = withPRs([pr(1)])
    const after = appReducer(before, { type: "APPEND_PRS", prs: [pr(1)] })
    expect(after.prs[0]!.state).toBe("OPEN")
    expect(after.prs).toHaveLength(1)
  })
})

describe("REPLACE_REPO_PRS", () => {
  const apiPR = (number: number, over: Partial<PR> = {}) =>
    pr(number, { url: `https://github.com/acme/api/pull/${number}`, ...over })

  test("swaps the repo's open rows and leaves other repos alone", () => {
    const refreshing = appReducer(withPRs([pr(1), apiPR(2)]), { type: "SET_REFRESHING", refreshing: true })
    const state = appReducer(refreshing, { type: "REPLACE_REPO_PRS", repo: "Acme/API", prs: [apiPR(3)] })
    expect(state.prs.map((p) => p.number).sort()).toEqual([1, 3])
    expect(state.refreshing).toBe(true)
  })

  test("keeps the repo's merged rows, which no open-PR fetch returns", () => {
    const state = appReducer(withPRs([apiPR(2, { state: "MERGED" })]), {
      type: "REPLACE_REPO_PRS",
      repo: "acme/api",
      prs: [],
    })
    expect(state.prs.map((p) => p.number)).toEqual([2])
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

describe("NEW_TAB", () => {
  test("opens a blank tab after the others and switches to it, keeping the old tab's cursor", () => {
    const filtered = appReducer(appReducer(withPRs([pr(1), pr(2)]), {
      type: "SET_DISCOVERY_QUERY",
      query: "@candril",
    }), { type: "SELECT", index: 1 })

    const state = appReducer(filtered, { type: "NEW_TAB" })
    const left = state.tabs.find((t) => t.id === filtered.activeTabId)
    const opened = state.tabs[state.tabs.length - 1]

    expect(state.tabs).toHaveLength(filtered.tabs.length + 1)
    expect(state.activeTabId).toBe(opened.id)
    expect(opened.filterQuery).toBe("")
    expect(state.discoveryQuery).toBe("")
    expect(state.selectedIndex).toBe(0)
    expect(left?.filterQuery).toBe("@candril")
    expect(left?.selectedIndex).toBe(1)
  })
})

describe("MOVE_TAB", () => {
  const tab = (id: string): Tab => ({
    id,
    title: id,
    filterQuery: "",
    hasNotification: false,
    selectedIndex: 0,
  })
  const withTabs = (ids: string[], activeTabId: string) =>
    appReducer(createInitialState(), { type: "LOAD_TABS", tabs: ids.map(tab), activeTabId })
  const ids = (state: AppState) => state.tabs.map((t) => t.id)

  test("moves the active tab one left and keeps it active", () => {
    const state = appReducer(withTabs(["a", "b", "c"], "b"), { type: "MOVE_TAB", delta: -1 })

    expect(ids(state)).toEqual(["b", "a", "c"])
    expect(state.activeTabId).toBe("b")
  })

  test("moves the active tab one right and keeps it active", () => {
    const state = appReducer(withTabs(["a", "b", "c"], "b"), { type: "MOVE_TAB", delta: 1 })

    expect(ids(state)).toEqual(["a", "c", "b"])
    expect(state.activeTabId).toBe("b")
  })

  test("does nothing at the ends", () => {
    const first = withTabs(["a", "b", "c"], "a")
    const last = withTabs(["a", "b", "c"], "c")

    expect(appReducer(first, { type: "MOVE_TAB", delta: -1 })).toBe(first)
    expect(appReducer(last, { type: "MOVE_TAB", delta: 1 })).toBe(last)
  })

  test("does nothing with a single tab", () => {
    const single = withTabs(["a"], "a")

    expect(appReducer(single, { type: "MOVE_TAB", delta: -1 })).toBe(single)
    expect(appReducer(single, { type: "MOVE_TAB", delta: 1 })).toBe(single)
  })
})
