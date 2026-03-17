/**
 * Tab types for dynamic PR tabs
 */

/** A tab with its own filter state */
export interface Tab {
  /** Unique identifier */
  id: string
  /** Auto-generated or custom title */
  title: string
  /** User-overridden title (P2) */
  titleOverride?: string
  /** The filter query for this tab */
  filterQuery: string
  /** Whether any PR in this tab has unread activity */
  hasNotification: boolean
  /** Selected index within this tab's filtered PRs */
  selectedIndex: number
}

/** State for all tabs */
export interface TabsState {
  tabs: Tab[]
  activeTabId: string
}

/** Create a default tab */
export function createDefaultTab(): Tab {
  return {
    id: crypto.randomUUID(),
    title: "All PRs",
    filterQuery: "",
    hasNotification: false,
    selectedIndex: 0,
  }
}

/** Duplicate a tab */
export function duplicateTab(tab: Tab): Tab {
  return {
    id: crypto.randomUUID(),
    title: tab.title,
    filterQuery: tab.filterQuery,
    hasNotification: tab.hasNotification,
    selectedIndex: tab.selectedIndex,
  }
}
