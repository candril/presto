/**
 * Tab module exports
 */

export { type Tab, type TabsState, createDefaultTab, duplicateTab } from "./types"
export { generateTabTitle } from "./title"
export { loadTabs, saveTabs, debouncedSaveTabs, getInitialTabsState } from "./persistence"
