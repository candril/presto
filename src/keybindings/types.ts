/**
 * Keybinding types
 */

/** All bindable actions in the app */
export type KeyAction =
  // Navigation
  | "nav.down"
  | "nav.up"
  | "nav.top"
  | "nav.bottom"
  | "nav.pageDown"
  | "nav.pageUp"
  // Actions
  | "action.open"
  | "action.browser"
  | "action.checkout"
  | "action.copyNumber"
  | "action.copyUrl"
  | "action.star"
  | "action.mark"
  | "action.refresh"
  | "action.forceRefresh"
  // Filters
  | "filter.open"
  | "filter.clear"
  | "filter.marked"
  | "filter.recent"
  | "filter.starred"
  | "filter.expanded"
  // Tabs
  | "tab.new"
  | "tab.close"
  | "tab.undo"
  | "tab.prev"
  | "tab.next"
  | "tab.1"
  | "tab.2"
  | "tab.3"
  | "tab.4"
  | "tab.5"
  | "tab.6"
  | "tab.7"
  | "tab.8"
  | "tab.9"
  // UI
  | "ui.help"
  | "ui.quit"
  | "ui.preview"
  | "ui.previewCycle"
  | "ui.commandPalette"

/** Parsed key combination */
export interface KeyCombo {
  /** The key name: "q", "p", "return", "escape", "space", "[", etc. */
  key: string
  /** Ctrl modifier */
  ctrl?: boolean
  /** Shift modifier */
  shift?: boolean
}

/** Keyboard event from useKeyboard hook */
export interface KeyEvent {
  name: string
  sequence?: string
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
}
