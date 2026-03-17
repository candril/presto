/**
 * Command palette types
 */

import type { CliRenderer } from "@opentui/core"
import type { PR, ColumnVisibility, Tab } from "../types"
import type { Config } from "../config"
import type { History } from "../history"
import type { AppAction } from "../state"

/** Command categories for grouping */
export type CommandCategory = "filter" | "action" | "state" | "column"

/** Result of executing a command */
export type CommandResult =
  | { type: "success"; message?: string }
  | { type: "error"; message: string }
  | { type: "refresh" } // Trigger PR list refresh after state change
  | { type: "merge_dialog" } // Open merge method selection dialog
  | { type: "rename_tab" } // Open tab rename dialog

/** Context passed to command execute function */
export interface CommandContext {
  selectedPR: PR | null
  dispatch: (action: AppAction) => void
  config: Config
  history: History
  setHistory: (history: History) => void
  renderer: CliRenderer
  fetchPRs: (showAsRefresh?: boolean) => void
  setShowHelp: (show: boolean) => void
  columnVisibility: ColumnVisibility
  // Tab state (spec 011)
  tabs: Tab[]
  activeTabId: string
}

/** Command definition */
export interface Command {
  id: string
  label: string
  category: CommandCategory

  // Display
  description?: string
  shortcut?: string // Existing keybinding to show

  // Behavior
  requiresPR?: boolean // Only show when PR is selected
  dangerous?: boolean // Requires confirmation
  available?: (ctx: CommandContext) => boolean // Dynamic visibility
  getLabel?: (ctx: CommandContext) => string // Dynamic label based on state

  // Execution
  execute: (ctx: CommandContext) => Promise<CommandResult>
}
