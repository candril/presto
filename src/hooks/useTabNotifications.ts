/**
 * Hook to track notification dots on tabs
 * 
 * For the active tab, we use the already-filtered PRs (which accounts for
 * repo config, starred-only filters, etc.)
 * 
 * For inactive tabs, we apply a simplified filter (basic filtering without
 * repo config or starred-only logic) to check for notifications.
 */

import { useEffect, useMemo } from "react"
import { getPRKey, isPRMarked } from "../history"
import { getRepoName, type PR, type Tab } from "../types"
import type { History } from "../history"
import type { Config } from "../config"
import { parseFilter, applyFilter } from "../discovery"

interface UseTabNotificationsOptions {
  tabs: Tab[]
  activeTabId: string
  /** The already-filtered PRs for the active tab */
  filteredPRs: PR[]
  /** All PRs (unfiltered) for computing inactive tab notifications */
  allPRs: PR[]
  history: History
  config: Config
  currentUser: string | null
  dispatch: (action: any) => void
}

/**
 * Check if a PR has unread activity
 */
function prHasUnread(pr: PR, history: History): boolean {
  const prKey = getPRKey(getRepoName(pr), pr.number)
  return history.prSnapshots?.[prKey]?.hasChanges ?? false
}

/**
 * Apply a tab's filter to PRs (simplified version for notification checking)
 * This doesn't include repo config or starred-only logic, but is good enough
 * for checking if a tab has any notifications.
 */
function applyTabFilter(
  prs: PR[], 
  filterQuery: string, 
  history: History,
  currentUser: string | null
): PR[] {
  const filter = parseFilter(filterQuery)
  
  // Resolve @me to current user
  if (currentUser && filter.authors.includes("me")) {
    filter.authors = filter.authors.map(a => a === "me" ? currentUser.toLowerCase() : a)
  }
  
  // Handle special filters
  if (filter.marked) {
    return prs.filter(pr => {
      const prKey = getPRKey(getRepoName(pr), pr.number)
      return isPRMarked(history, prKey)
    })
  }
  
  if (filter.recent) {
    const recentKeys = new Set(history.recentlyViewed.map(r => `${r.repo}#${r.number}`))
    return prs.filter(pr => {
      const prKey = getPRKey(getRepoName(pr), pr.number)
      return recentKeys.has(prKey)
    })
  }
  
  if (filter.starred) {
    let result = applyFilter(prs, { ...filter, starred: false })
    return result.filter(pr => history.starredAuthors.includes(pr.author.login))
  }
  
  return applyFilter(prs, filter)
}

/**
 * Update all tabs' notification dots based on their filtered PRs
 */
export function useTabNotifications({
  tabs,
  activeTabId,
  filteredPRs,
  allPRs,
  history,
  config,
  currentUser,
  dispatch,
}: UseTabNotificationsOptions) {
  // Compute notifications for all tabs
  const tabNotifications = useMemo(() => {
    const result: Record<string, boolean> = {}
    
    for (const tab of tabs) {
      if (tab.id === activeTabId) {
        // For active tab, use the already-computed filteredPRs (most accurate)
        result[tab.id] = filteredPRs.some(pr => prHasUnread(pr, history))
      } else {
        // For inactive tabs, apply simplified filter
        const tabPRs = applyTabFilter(allPRs, tab.filterQuery, history, currentUser)
        result[tab.id] = tabPRs.some(pr => prHasUnread(pr, history))
      }
    }
    
    return result
  }, [tabs, activeTabId, filteredPRs, allPRs, history, currentUser])

  // Update tabs with changed notification state
  useEffect(() => {
    for (const tab of tabs) {
      const hasNotification = tabNotifications[tab.id] ?? false
      if (tab.hasNotification !== hasNotification) {
        dispatch({
          type: "UPDATE_TAB_NOTIFICATION",
          tabId: tab.id,
          hasNotification,
        })
      }
    }
  }, [tabs, tabNotifications, dispatch])
}
