/**
 * Tab persistence - save/load tabs to disk
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getConfigDir } from "../config"
import type { Tab } from "./types"
import { createDefaultTab } from "./types"

/** Tabs file path */
const TABS_FILE = join(getConfigDir(), "tabs.json")

/** Persisted tabs structure */
interface PersistedTabs {
  tabs: Tab[]
  activeTabId: string
}

/**
 * Load tabs from disk
 * Returns null if no tabs file exists or it's invalid
 */
export function loadTabs(): PersistedTabs | null {
  if (!existsSync(TABS_FILE)) {
    return null
  }

  try {
    const content = readFileSync(TABS_FILE, "utf-8")
    const data = JSON.parse(content) as PersistedTabs
    
    // Validate structure
    if (!Array.isArray(data.tabs) || data.tabs.length === 0) {
      return null
    }
    if (!data.activeTabId || !data.tabs.some(t => t.id === data.activeTabId)) {
      // Fix invalid active tab
      data.activeTabId = data.tabs[0].id
    }
    
    return data
  } catch {
    return null
  }
}

/**
 * Save tabs to disk
 */
export function saveTabs(tabs: Tab[], activeTabId: string): void {
  const data: PersistedTabs = { tabs, activeTabId }
  writeFileSync(TABS_FILE, JSON.stringify(data, null, 2))
}

/** Debounce timer */
let saveTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Debounced save to avoid excessive writes
 * Waits 500ms after last change before saving
 */
export function debouncedSaveTabs(tabs: Tab[], activeTabId: string): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(() => {
    saveTabs(tabs, activeTabId)
    saveTimeout = null
  }, 500)
}

/**
 * Get initial tabs state (load from disk or create default)
 */
export function getInitialTabsState(): PersistedTabs {
  const persisted = loadTabs()
  if (persisted) {
    return persisted
  }
  
  // Create default single tab
  const defaultTab = createDefaultTab()
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id,
  }
}
