/**
 * Default keybindings
 */

import type { KeyAction } from "./types"

/** Default keybinding for each action */
export const defaultBindings: Record<KeyAction, string> = {
  // Navigation
  "nav.down": "j",
  "nav.up": "k",
  "nav.top": "g",
  "nav.bottom": "G",
  "nav.pageDown": "ctrl+d",
  "nav.pageUp": "ctrl+u",

  // Actions
  "action.open": "return",
  "action.browser": "o",
  "action.checkout": "space",
  "action.copyNumber": "y",
  "action.copyUrl": "Y",
  "action.star": "s",
  "action.mark": "m",
  "action.refresh": "r",
  "action.forceRefresh": "R",

  // Filters
  "filter.open": "/",
  "filter.clear": "backspace",
  "filter.marked": "ctrl+m",
  "filter.recent": "ctrl+r",
  "filter.starred": "ctrl+s",
  "filter.expanded": "ctrl+e",

  // Tabs
  "tab.new": "t",
  "tab.close": "d",
  "tab.undo": "u",
  "tab.prev": "[",
  "tab.next": "]",
  "tab.1": "1",
  "tab.2": "2",
  "tab.3": "3",
  "tab.4": "4",
  "tab.5": "5",
  "tab.6": "6",
  "tab.7": "7",
  "tab.8": "8",
  "tab.9": "9",

  // UI
  "ui.help": "?",
  "ui.quit": "q",
  "ui.preview": "p",
  "ui.previewCycle": "P",
  "ui.commandPalette": "ctrl+p",
}
