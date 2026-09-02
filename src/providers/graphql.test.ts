import { describe, expect, test } from "bun:test"
import { countComments } from "./graphql"

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
