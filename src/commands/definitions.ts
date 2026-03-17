/**
 * Command definitions for the command palette
 */

import { $ } from "bun"
import type { Command, CommandContext } from "./types"
import { openInBrowser, openInRiff, copyPRUrl, copyPRNumber } from "../actions/tools"
import { checkoutPR } from "../actions/checkout"
import { toggleStarAuthor, saveHistory, toggleMarkPR, isPRMarked, getPRKey, removePRFromRecent, forgetRepo, isRepoVisited } from "../history"
import { prHasChanges, togglePRUnread } from "../notifications"
import { saveColumnVisibility } from "../cache"
import { getRepoName, type ColumnId } from "../types"

/** Repo merge settings cache */
export interface RepoMergeSettings {
  allowMergeCommit: boolean
  allowSquashMerge: boolean
  allowRebaseMerge: boolean
}
const repoMergeSettingsCache = new Map<string, RepoMergeSettings>()

/** PR merge state */
export interface PRMergeState {
  mergeable: boolean
  mergeableState: string // "clean", "dirty", "blocked", "behind", "unknown"
}

/** Fetch PR merge state */
export async function getPRMergeState(repo: string, number: number): Promise<PRMergeState> {
  try {
    const result = await $`gh api repos/${repo}/pulls/${number} --jq '{mergeable: .mergeable, mergeableState: .mergeable_state}'`.json()
    return result as PRMergeState
  } catch {
    return { mergeable: true, mergeableState: "unknown" }
  }
}

/** Fetch and cache repo merge settings */
export async function getRepoMergeSettings(repo: string): Promise<RepoMergeSettings> {
  const cached = repoMergeSettingsCache.get(repo)
  if (cached) return cached

  try {
    const result = await $`gh api repos/${repo} --jq '{allowMergeCommit: .allow_merge_commit, allowSquashMerge: .allow_squash_merge, allowRebaseMerge: .allow_rebase_merge}'`.json()
    const settings = result as RepoMergeSettings
    repoMergeSettingsCache.set(repo, settings)
    return settings
  } catch {
    // Default to all allowed if we can't fetch
    return { allowMergeCommit: true, allowSquashMerge: true, allowRebaseMerge: true }
  }
}

export type MergeMethod = "merge" | "squash" | "rebase"

/** Execute the actual merge with selected method */
export async function executeMerge(
  pr: { number: number; url: string },
  repo: string,
  method: MergeMethod,
  dispatch: (action: any) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const flag = method === "merge" ? "--merge" : method === "squash" ? "--squash" : "--rebase"
    const result = await $`gh pr merge ${pr.number} -R ${repo} ${flag}`.quiet()
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr.toString().trim() || "Merge failed" }
    }
    // Update UI only on success
    dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "MERGED" } })
    const methodLabel = method === "merge" ? "Merged" : method === "squash" ? "Squash merged" : "Rebase merged"
    return { success: true, message: `${methodLabel} #${pr.number}` }
  } catch (e: any) {
    const stderr = e?.stderr?.toString?.()?.trim() || e?.message || "Merge failed"
    return { success: false, message: stderr }
  }
}

/** Column display names */
const COLUMN_NAMES: Record<ColumnId, string> = {
  state: "State",
  checks: "Checks",
  review: "Review",
  comments: "Comments",
  time: "Time",
  repo: "Repository",
  author: "Author",
}

/** Get column commands with current visibility state in labels */
export function getColumnCommands(ctx: CommandContext): Command[] {
  const columns: ColumnId[] = ["state", "checks", "review", "comments", "time", "repo", "author"]
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

/** Get tab commands based on current context */
export function getTabCommands(ctx: CommandContext): Command[] {
  const cmds: Command[] = []

  // Close tab - only if more than one tab
  if (ctx.tabs.length > 1) {
    cmds.push({
      id: "tab.close",
      label: "Close Tab",
      category: "action" as const,
      shortcut: "t",
      execute: async (execCtx: CommandContext) => {
        execCtx.dispatch({ type: "CLOSE_TAB", tabId: execCtx.activeTabId })
        return { type: "success", message: "Tab closed" }
      },
    })
  }

  // New tab (duplicate current)
  cmds.push({
    id: "tab.duplicate",
    label: "Duplicate Tab",
    category: "action" as const,
    shortcut: "t",
    execute: async (execCtx: CommandContext) => {
      execCtx.dispatch({ type: "DUPLICATE_TAB" })
      return { type: "success", message: "Tab duplicated" }
    },
  })

  return cmds
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
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: ">marked" })
      return { type: "success" }
    },
  },
  {
    id: "filter.recent",
    label: "Show recent PRs",
    category: "filter",
    shortcut: "Ctrl+R",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: ">recent" })
      return { type: "success" }
    },
  },
  {
    id: "filter.starred",
    label: "Show PRs from starred authors",
    category: "filter",
    shortcut: "Ctrl+S",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: ">starred" })
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
    id: "action.checkout",
    label: "Checkout PR locally",
    category: "action",
    shortcut: "Space",
    requiresPR: true,
    execute: async (ctx) => {
      const result = await checkoutPR(ctx.selectedPR!, ctx.config)
      return {
        type: result.success ? "success" : "error",
        message: result.message,
      }
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
    id: "action.toggle_unread",
    label: "Mark as unread",
    category: "action",
    requiresPR: true,
    // Dynamic label based on current state
    getLabel: (ctx) => {
      const prKey = getPRKey(getRepoName(ctx.selectedPR!), ctx.selectedPR!.number)
      const isUnread = prHasChanges(ctx.history, prKey)
      return isUnread ? "Mark as read" : "Mark as unread"
    },
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const prKey = getPRKey(getRepoName(pr), pr.number)
      const wasUnread = prHasChanges(ctx.history, prKey)
      const newHistory = togglePRUnread(ctx.history, prKey)
      ctx.setHistory(newHistory)
      saveHistory(newHistory)
      return {
        type: "success",
        message: wasUnread ? "Marked as read" : "Marked as unread",
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
    id: "action.forget_repo",
    label: "Forget this repo",
    category: "action",
    requiresPR: true,
    // Only show if repo is visited (not configured)
    available: (ctx) => {
      if (!ctx.selectedPR) return false
      const repo = getRepoName(ctx.selectedPR)
      const isConfigured = ctx.config.repositories.some((r) => r.name === repo)
      return !isConfigured && isRepoVisited(ctx.history, repo)
    },
    execute: async (ctx) => {
      const repo = getRepoName(ctx.selectedPR!)
      const newHistory = forgetRepo(ctx.history, repo)
      ctx.setHistory(newHistory)
      saveHistory(newHistory)
      return {
        type: "success",
        message: `Forgot ${repo}`,
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
    dangerous: false, // Uses its own confirmation via merge method dialog
    // This command triggers a merge method selection dialog
    // The actual merge method is handled by the dialog
    available: (ctx) =>
      ctx.selectedPR?.state === "OPEN" && !ctx.selectedPR?.isDraft,
    execute: async (ctx) => {
      // This will be handled by the merge dialog - return a special result
      return { type: "merge_dialog" } as any
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
  // Add tab commands
  return [...filtered, ...getColumnCommands(ctx), ...getTabCommands(ctx)]
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
