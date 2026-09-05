/**
 * Command definitions for the command palette
 */

import type { Command, CommandContext } from "./types"
import { copyPRUrl, copyPRNumber, copyPRBranch } from "../actions/tools"
import {
  openInBrowser,
  openRepoInBrowser,
  openInRiff,
  openInRiffTmuxWindow,
  openDiff,
  checkoutPR,
  updateBranchFromBase,
  disableAutoMerge,
  openFailingChecks,
  rerunChecks,
  markReady,
  convertToDraft,
  closePR,
  reopenPR,
} from "../providers"
import { toggleStarAuthor, saveHistory, toggleMarkPR, isPRMarked, getPRKey, removePRFromRecent, forgetRepo, isRepoVisited } from "../history"
import { prHasChanges, togglePRUnread } from "../notifications"
import { saveColumnVisibility } from "../cache"
import { getRepoName, type ColumnId, type PR } from "../types"
import type { AppAction } from "../state"

/**
 * GitHub accepts the update and applies it asynchronously, so the row would otherwise
 * sit unchanged for seconds. The marker clears itself once a refresh shows a new head
 * commit, or when the TTL expires.
 */
function markBranchUpdatePending(ctx: CommandContext, pr: PR): void {
  // Stop the base column telling the user to do the thing they just did. "unknown" rather
  // than "up-to-date": the update has not landed yet, and a refresh settles it either way.
  ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { baseSync: "unknown" } })
  ctx.dispatch({
    type: "SET_PR_PENDING",
    prKey: getPRKey(getRepoName(pr), pr.number),
    kind: "update-branch",
    firedAt: Date.now(),
  })
}

/** Column display names */
const COLUMN_NAMES: Record<ColumnId, string> = {
  state: "State",
  checks: "Checks",
  review: "Review",
  sync: "Base sync",
  merge: "Merge verdict",
  comments: "Comments",
  time: "Time",
  repo: "Repository",
  author: "Author",
}

/** Get column commands with current visibility state in labels */
export function getColumnCommands(ctx: CommandContext): Command[] {
  const columns: ColumnId[] = ["state", "checks", "review", "sync", "merge", "comments", "time", "repo", "author"]
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
      shortcut: "d",
      execute: async (execCtx: CommandContext) => {
        execCtx.dispatch({ type: "CLOSE_TAB", tabId: execCtx.activeTabId })
        return { type: "success", message: "Tab closed" }
      },
    })

    cmds.push({
      id: "tab.close_others",
      label: "Close Other Tabs",
      category: "action" as const,
      execute: async (execCtx: CommandContext) => {
        execCtx.dispatch({ type: "CLOSE_OTHER_TABS" })
        return { type: "success", message: "Closed other tabs" }
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

  // Rename tab
  cmds.push({
    id: "tab.rename",
    label: "Rename Tab",
    category: "action" as const,
    execute: async (_execCtx: CommandContext) => {
      // Return special result to trigger rename dialog
      return { type: "rename_tab" }
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
    id: "filter.unread",
    label: "Show unread PRs",
    category: "filter",
    shortcut: "Ctrl+U",
    execute: async (ctx) => {
      ctx.dispatch({ type: "SET_DISCOVERY_QUERY", query: ">unread" })
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
      const result = await openInBrowser(ctx.selectedPR!)
      return { type: result.success ? "success" : "error", message: result.message }
    },
  },
  {
    id: "action.repo_browser",
    label: "Open repository in GitHub",
    category: "action",
    requiresPR: true,
    execute: async (ctx) => {
      const result = await openRepoInBrowser(ctx.selectedPR!)
      return { type: result.success ? "success" : "error", message: result.message }
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
        const result = await openInRiff(ctx.selectedPR!)
        return { type: "success", message: result.message || undefined }
      } finally {
        ctx.renderer.resume()
        ctx.fetchPRs(true)
      }
    },
  },
  {
    id: "action.riff_tmux",
    label: "Open in riff (tmux window)",
    category: "action",
    shortcut: "O",
    requiresPR: true,
    execute: async (ctx) => {
      const result = await openInRiffTmuxWindow(ctx.selectedPR!)
      return { type: result.success ? "success" : "error", message: result.message }
    },
  },
  {
    id: "action.diff",
    label: "View diff",
    category: "action",
    shortcut: "D",
    requiresPR: true,
    execute: async (ctx) => {
      ctx.renderer.suspend()
      try {
        const result = await openDiff(ctx.selectedPR!, ctx.config.tools.diff)
        return { type: "success", message: result.message || undefined }
      } finally {
        ctx.renderer.resume()
      }
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
    id: "action.copy_branch",
    label: "Copy branch name",
    category: "action",
    shortcut: "b",
    requiresPR: true,
    execute: async (ctx) => {
      const ok = await copyPRBranch(ctx.selectedPR!)
      return ok
        ? { type: "success", message: `Copied ${ctx.selectedPR!.headRefName}` }
        : { type: "error", message: "No branch name available" }
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
    label: "Mark PR with letter",
    category: "action",
    shortcut: "m + a-z",
    requiresPR: true,
    execute: async (ctx) => {
      // Trigger mark-pending mode — user will press a letter next
      ctx.dispatch({ type: "SET_MARK_PENDING", pending: true })
      ctx.dispatch({ type: "SHOW_MESSAGE", message: "Mark: _" })
      return { type: "success" }
    },
  },
  {
    id: "action.toggle_unread",
    label: "Mark as unread",
    shortcut: "v",
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
    id: "action.checks",
    label: "Open failing checks in browser",
    category: "action",
    shortcut: "x",
    requiresPR: true,
    execute: async (ctx) => {
      const result = await openFailingChecks(ctx.selectedPR!)
      return { type: result.success ? "success" : "error", message: result.message }
    },
  },
  {
    id: "action.rerun_checks",
    label: "Re-run checks",
    category: "action",
    requiresPR: true,
    // Confirmed: every invocation spends real CI on shared runners
    dangerous: true,
    execute: async (ctx) => {
      const result = await rerunChecks(ctx.selectedPR!)
      return { type: result.success ? "success" : "error", message: result.message }
    },
  },
  {
    id: "action.gate_detail",
    label: "Expand/collapse status columns",
    category: "action",
    shortcut: "c",
    execute: async (ctx) => {
      ctx.dispatch({ type: "TOGGLE_GATE_DETAIL" })
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
    id: "action.review",
    label: "Submit review",
    category: "action",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.state === "OPEN",
    execute: async (_ctx) => {
      // Handled by CommandPalette — opens the review dialog
      return { type: "review_dialog" } as any
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
  {
    id: "action.trigger_workflow",
    label: "Trigger workflow…",
    category: "action",
    requiresPR: true,
    available: (ctx) => !!ctx.selectedPR?.headRefName,
    execute: async (_ctx) => {
      return { type: "workflow_dialog" }
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
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { isDraft: false } })
      const result = await markReady(pr)
      return { type: result.success ? "success" : "error", message: result.message }
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
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { isDraft: true } })
      const result = await convertToDraft(pr)
      return { type: result.success ? "success" : "error", message: result.message }
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
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "CLOSED" } })
      const result = await closePR(pr)
      return { type: result.success ? "success" : "error", message: result.message }
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
      // Optimistic update
      ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { state: "OPEN" } })
      const result = await reopenPR(pr)
      return { type: result.success ? "success" : "error", message: result.message }
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
  {
    id: "state.update_branch",
    label: "Update branch from base",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.state === "OPEN",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const result = await updateBranchFromBase(pr, "merge")
      if (result.success) markBranchUpdatePending(ctx, pr)
      return { type: result.success ? "success" : "error", message: result.message }
    },
  },
  {
    id: "state.update_branch_rebase",
    label: "Update branch from base (rebase)",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.state === "OPEN",
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const result = await updateBranchFromBase(pr, "rebase")
      if (result.success) markBranchUpdatePending(ctx, pr)
      return { type: result.success ? "success" : "error", message: result.message }
    },
  },
  {
    id: "state.auto_merge",
    label: "Enable auto-merge",
    category: "state",
    requiresPR: true,
    available: (ctx) =>
      ctx.selectedPR?.state === "OPEN" && ctx.selectedPR?.autoMergeMethod == null,
    execute: async (_ctx) => {
      // Handled by CommandPalette — the merge dialog picks the method
      return { type: "auto_merge_dialog" }
    },
  },
  {
    id: "state.disable_auto_merge",
    label: "Disable auto-merge",
    category: "state",
    requiresPR: true,
    available: (ctx) => ctx.selectedPR?.autoMergeMethod != null,
    execute: async (ctx) => {
      const pr = ctx.selectedPR!
      const result = await disableAutoMerge(pr)
      if (result.success) {
        ctx.dispatch({ type: "UPDATE_PR", url: pr.url, updates: { autoMergeMethod: null } })
      }
      return { type: result.success ? "success" : "error", message: result.message }
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
