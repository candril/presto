/**
 * Command definitions for the command palette
 */

import { $ } from "bun"
import type { Command, CommandContext } from "./types"
import { openInBrowser, openInRiff, copyPRUrl, copyPRNumber } from "../actions/tools"
import { toggleStarAuthor, saveHistory, toggleMarkPR, isPRMarked, getPRKey, removePRFromRecent } from "../history"
import { saveColumnVisibility } from "../cache"
import { getRepoName, type ColumnId } from "../types"

/** Column display names */
const COLUMN_NAMES: Record<ColumnId, string> = {
  state: "State",
  checks: "Checks",
  review: "Review",
  time: "Time",
  repo: "Repository",
  author: "Author",
}

/** Get column commands with current visibility state in labels */
export function getColumnCommands(ctx: CommandContext): Command[] {
  const columns: ColumnId[] = ["state", "checks", "review", "time", "repo", "author"]
  return columns.map((columnId) => ({
    id: `column.${columnId}`,
    label: `${ctx.columnVisibility[columnId] ? "Hide" : "Show"} ${COLUMN_NAMES[columnId]} column`,
    category: "column" as const,
    execute: async (execCtx: CommandContext) => {
      execCtx.dispatch({ type: "TOGGLE_COLUMN", column: columnId })
      const newVisibility = {
        ...execCtx.columnVisibility,
        [columnId]: !execCtx.columnVisibility[columnId],
      }
      saveColumnVisibility(newVisibility)
      const visible = newVisibility[columnId]
      return {
        type: "success",
        message: `${COLUMN_NAMES[columnId]} column ${visible ? "shown" : "hidden"}`,
      }
    },
  }))
}

/** All available commands */
export const commands: Command[] = [
  // ============================================================================
  // FILTERS
  // ============================================================================
  {
    id: "filter.all",
    label: "Show all PRs",
    category: "filter",
    shortcut: "*",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "*" })
      return { type: "success" }
    },
  },
  {
    id: "filter.mine",
    label: "Show my PRs",
    category: "filter",
    shortcut: "@me",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "@me" })
      return { type: "success" }
    },
  },
  {
    id: "filter.drafts",
    label: "Show draft PRs",
    category: "filter",
    shortcut: "state:draft",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "state:draft" })
      return { type: "success" }
    },
  },
  {
    id: "filter.open",
    label: "Show open PRs",
    category: "filter",
    shortcut: "state:open",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "state:open" })
      return { type: "success" }
    },
  },
  {
    id: "filter.clear",
    label: "Clear filters",
    category: "filter",
    shortcut: "Esc",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "" })
      return { type: "success", message: "Filters cleared" }
    },
  },
  {
    id: "filter.marked",
    label: "Show marked PRs",
    category: "filter",
    shortcut: "Ctrl+M",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "@marked" })
      return { type: "success" }
    },
  },
  {
    id: "filter.recent",
    label: "Show recent PRs",
    category: "filter",
    shortcut: "Ctrl+R",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "@recent" })
      return { type: "success" }
    },
  },
  {
    id: "filter.starred",
    label: "Show PRs from starred authors",
    category: "filter",
    shortcut: "Ctrl+S",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: "@starred" })
      return { type: "success" }
    },
  },

  // ============================================================================
  // ACTIONS
  // ============================================================================
  {
    id: "action.browser",
    label: "Open in browser",
    category: "action",
    shortcut: "o",
    requiresPR: true,
    execute: async (ctx) => {
      await openInBrowser(ctx.selectedPR!)
      return { type: "success", message: "Opened in browser" }
    },
  },
  {
    id: "action.riff",
    label: "Open in riff",
    category: "action",
    shortcut: "Enter",
    requiresPR: true,
    execute: async (ctx) => {
      ctx.renderer.suspend()
      try {
        await openInRiff(ctx.selectedPR!)
      } finally {
        ctx.renderer.resume()
      }
      return { type: "success" }
    },
  },
  {
    id: "action.copy_url",
    label: "Copy URL",
    category: "action",
    shortcut: "Y",
    requiresPR: true,
    execute: async (ctx) => {
      await copyPRUrl(ctx.selectedPR!)
      return { type: "success", message: `Copied ${ctx.selectedPR!.url}` }
    },
  },
  {
    id: "action.copy_number",
    label: "Copy PR number",
    category: "action",
    shortcut: "y",
    requiresPR: true,
    execute: async (ctx) => {
      await copyPRNumber(ctx.selectedPR!)
      return { type: "success", message: `Copied #${ctx.selectedPR!.number}` }
    },
  },
  {
    id: "action.star",
    label: "Star/unstar author",
    category: "action",
    shortcut: "s",
    requiresPR: true,
    execute: async (ctx) => {
      const author = ctx.selectedPR!.author.login
      const newHistory = toggleStarAuthor(ctx.history, author)
      ctx.setHistory(newHistory)
      saveHistory(newHistory)
      const isStarred = newHistory.starredAuthors.includes(author)
      return {
        type: "success",
        message: `${isStarred ? "★ Starred" : "☆ Unstarred"} @${author}`,
      }
    },
  },
  {
    id: "action.mark",
    label: "Mark/unmark PR",
    category: "action",
    shortcut: "m",
    requiresPR: true,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const prKey = getPRKey(getRepoName(pr), pr.number)
      const newHistory = toggleMarkPR(ctx.history, prKey)
      ctx.setHistory(newHistory)
      saveHistory(newHistory)
      const isMarked = isPRMarked(newHistory, prKey)
      return {
        type: "success",
        message: isMarked ? "Marked" : "Unmarked",
      }
    },
  },
  {
    id: "action.clear_recent",
    label: "Clear from recent",
    category: "action",
    requiresPR: true,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const prKey = getPRKey(getRepoName(pr), pr.number)
      const newHistory = removePRFromRecent(ctx.history, prKey)
      ctx.setHistory(newHistory)
      saveHistory(newHistory)
      return {
        type: "success",
        message: "Cleared from recent",
      }
    },
  },
  {
    id: "action.filter_author",
    label: "Filter by this author",
    category: "action",
    requiresPR: true,
    execute: async (ctx) => {
      const author = ctx.selectedPR!.author.login
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: `@${author}` })
      return { type: "success" }
    },
  },
  {
    id: "action.filter_repo",
    label: "Filter by this repo",
    category: "action",
    requiresPR: true,
    execute: async (ctx) => {
      const repo = getRepoName(ctx.selectedPR!)
      const shortName = repo.split("/")[1] || repo
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: `repo:${shortName}` })
      return { type: "success" }
    },
  },
  {
    id: "action.help",
    label: "Show help",
    category: "action",
    shortcut: "?",
    execute: async (ctx) => {
      ctx.setShowHelp(true)
      return { type: "success" }
    },
  },
  {
    id: "action.refresh",
    label: "Refresh PRs",
    category: "action",
    shortcut: "R",
    execute: async (ctx) => {
      ctx.fetchPRs(true)
      return { type: "success", message: "Refreshing..." }
    },
  },

  // ============================================================================
  // STATE CHANGES
  // These use optimistic UI updates - update state immediately, then call API
  // ============================================================================
  {
    id: "state.ready",
    label: "Mark as ready",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.isDraft === true,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const repo = getRepoName(pr)
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { isDraft: false } })
      // API call
      await $`gh pr ready ${pr.number} -R ${repo}`.quiet()
      return { type: "success", message: `Marked #${pr.number} as ready` }
    },
  },
  {
    id: "state.draft",
    label: "Convert to draft",
    category: "state",
    requiresPR: true,
    available: (ctx) =>
      ctx.selectedPR?.isDraft === false && ctx.selectedPR?.state === "OPEN",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const repo = getRepoName(pr)
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { isDraft: true } })
      // API call
      await $`gh pr ready ${pr.number} -R ${repo} --undo`.quiet()
      return { type: "success", message: `Converted #${pr.number} to draft` }
    },
  },
  {
    id: "state.close",
    label: "Close PR",
    category: "state",
    requiresPR: true,
    dangerous: true,
    available: (ctx) => ctx.selectedPR?.state === "OPEN",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const repo = getRepoName(pr)
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "CLOSED" } })
      // API call
      await $`gh pr close ${pr.number} -R ${repo}`.quiet()
      return { type: "success", message: `Closed #${pr.number}` }
    },
  },
  {
    id: "state.reopen",
    label: "Reopen PR",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.state === "CLOSED",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const repo = getRepoName(pr)
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "OPEN" } })
      // API call
      await $`gh pr reopen ${pr.number} -R ${repo}`.quiet()
      return { type: "success", message: `Reopened #${pr.number}` }
    },
  },
  {
    id: "state.merge",
    label: "Merge PR",
    category: "state",
    requiresPR: true,
    dangerous: true,
    available: (ctx) =>
      ctx.selectedPR?.state === "OPEN" && !ctx.selectedPR?.isDraft,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const repo = getRepoName(pr)
      // Optimistic update - mark as merged
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "MERGED" } })
      // API call
      await $`gh pr merge ${pr.number} -R ${repo} --merge`.quiet()
      return { type: "success", message: `Merged #${pr.number}` }
    },
  },
  {
    id: "state.squash",
    label: "Squash and merge PR",
    category: "state",
    requiresPR: true,
    dangerous: true,
    available: (ctx) =>
      ctx.selectedPR?.state === "OPEN" && !ctx.selectedPR?.isDraft,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const repo = getRepoName(pr)
      // Optimistic update - mark as merged
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "MERGED" } })
      // API call
      await $`gh pr merge ${pr.number} -R ${repo} --squash`.quiet()
      return { type: "success", message: `Squash merged #${pr.number}` }
    },
  },
  {
    id: "state.rebase",
    label: "Rebase and merge PR",
    category: "state",
    requiresPR: true,
    dangerous: true,
    available: (ctx) =>
      ctx.selectedPR?.state === "OPEN" && !ctx.selectedPR?.isDraft,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const repo = getRepoName(pr)
      // Optimistic update - mark as merged
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "MERGED" } })
      // API call
      await $`gh pr merge ${pr.number} -R ${repo} --rebase`.quiet()
      return { type: "success", message: `Rebase merged #${pr.number}` }
    },
  },

  // Column commands are generated dynamically in getAvailableCommands
]

/** Get commands filtered by context */
export function getAvailableCommands(ctx: CommandContext): Command[] {
  const filtered = commands.filter((cmd) => {
    // Check if command requires a PR
    if (cmd.requiresPR && !ctx.selectedPR) return false
    // Check dynamic availability
    if (cmd.available && !cmd.available(ctx)) return false
    return true
  })
  // Add dynamic column commands with current visibility state
  return [...filtered, ...getColumnCommands(ctx)]
}

/** Group commands by category */
export function groupCommands(
  cmds: Command[]
): Record<string, Command[]> {
  const groups: Record<string, Command[]> = {}
  for (const cmd of cmds) {
    if (!groups[cmd.category]) {
      groups[cmd.category] = []
    }
    groups[cmd.category].push(cmd)
  }
  return groups
}

/** Format category name for display */
export function formatCategory(category: string): string {
  const names: Record<string, string> = {
    filter: "FILTERS",
    action: "ACTIONS",
    state: "STATE CHANGES",
    column: "COLUMNS",
  }
  return names[category] || category.toUpperCase()
}
