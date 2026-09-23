import { describe, expect, test } from "bun:test"
import { countComments, digestOf } from "./graphql"

const human = (login: string) => ({ author: { login } })
const thread = (opts: { author?: string; typename?: string; resolved: boolean; comments: number }) => ({
  isResolved: opts.resolved,
  comments: {
    totalCount: opts.comments,
    nodes: [{ author: { login: opts.author ?? "alice", __typename: opts.typename ?? "User" } }],
  },
})

describe("countComments", () => {
  test("conversation comments and review bodies count toward the total, never toward open", () => {
    const counts = countComments({
      comments: { nodes: [human("alice"), human("bob")] },
      reviews: { nodes: [human("carol")] },
    })
    expect(counts).toEqual({ total: 3, open: 0, unresolvedThreads: 0 })
  })

  test("opens only what sits in an unresolved thread", () => {
    const counts = countComments({
      comments: { nodes: [human("alice")] },
      reviewThreads: {
        nodes: [
          thread({ resolved: true, comments: 4 }),
          thread({ resolved: false, comments: 2 }),
        ],
      },
    })
    expect(counts).toEqual({ total: 7, open: 2, unresolvedThreads: 1 })
  })

  test("ignores bot comments and bot-opened threads entirely", () => {
    const counts = countComments({
      comments: { nodes: [human("alice"), human("dependabot[bot]")] },
      reviews: { nodes: [human("renovate")] },
      reviewThreads: {
        nodes: [
          thread({ author: "copilot-pull-request-reviewer", typename: "Bot", resolved: false, comments: 3 }),
          thread({ resolved: false, comments: 2 }),
        ],
      },
    })
    expect(counts).toEqual({ total: 3, open: 2, unresolvedThreads: 1 })
  })

  test("treats a thread of unknown resolution as resolved rather than open", () => {
    const counts = countComments({
      reviewThreads: { nodes: [{ comments: { totalCount: 2, nodes: [{ author: { login: "alice" } }] } }] },
    })
    expect(counts).toEqual({ total: 2, open: 0, unresolvedThreads: 0 })
  })

  test("survives a PR with none of the connections present", () => {
    expect(countComments({})).toEqual({ total: 0, open: 0, unresolvedThreads: 0 })
  })
})

describe("digestOf", () => {
  const node = (over: Record<string, any> = {}) => ({
    number: 7,
    updatedAt: "2026-09-23T10:00:00Z",
    isDraft: false,
    reviewDecision: "REVIEW_REQUIRED",
    mergeStateStatus: "CLEAN",
    comments: { totalCount: 3 },
    reviews: { totalCount: 1 },
    reviewThreads: { totalCount: 2 },
    commits: { nodes: [{ commit: { oid: "abc123", statusCheckRollup: { state: "SUCCESS" } } }] },
    ...over,
  })

  test("an untouched repo digests identically", () => {
    expect(digestOf([node()])).toBe(digestOf([node()]))
  })

  test("node order does not matter", () => {
    const a = node({ number: 1 })
    const b = node({ number: 2 })
    expect(digestOf([a, b])).toBe(digestOf([b, a]))
  })

  // Each of these is a change a refresh must not skip. updatedAt is the
  // obvious one; the rest are the movements GitHub leaves updatedAt alone for.
  const movements: Array<[string, Record<string, any>]> = [
    ["a new comment", { comments: { totalCount: 4 } }],
    ["a new review", { reviews: { totalCount: 2 } }],
    ["a new review thread", { reviewThreads: { totalCount: 3 } }],
    ["an edit", { updatedAt: "2026-09-23T11:00:00Z" }],
    ["leaving draft", { isDraft: true }],
    ["an approval", { reviewDecision: "APPROVED" }],
    ["falling behind base", { mergeStateStatus: "BEHIND" }],
    ["a force push", { commits: { nodes: [{ commit: { oid: "def456", statusCheckRollup: { state: "SUCCESS" } } }] } }],
    ["checks going red", { commits: { nodes: [{ commit: { oid: "abc123", statusCheckRollup: { state: "FAILURE" } } }] } }],
  ]

  for (const [what, over] of movements) {
    test(`${what} moves the digest`, () => {
      expect(digestOf([node(over)])).not.toBe(digestOf([node()]))
    })
  }

  test("an opened PR moves the digest", () => {
    expect(digestOf([node(), node({ number: 8 })])).not.toBe(digestOf([node()]))
  })

  test("a merged PR leaving the open set moves the digest", () => {
    expect(digestOf([node()])).not.toBe(digestOf([node(), node({ number: 8 })]))
  })

  test("a PR with no commits or rollup yet digests without throwing", () => {
    expect(() => digestOf([node({ commits: { nodes: [] } })])).not.toThrow()
    expect(digestOf([node({ commits: { nodes: [] } })]))
      .not.toBe(digestOf([node()]))
  })

  test("nulls in the node list are dropped", () => {
    expect(digestOf([null, node(), undefined])).toBe(digestOf([node()]))
  })
})
