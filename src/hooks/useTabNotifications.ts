/**
 * Hook to track notification dots on tabs
 * 
 * For the active tab, we use the already-filtered PRs (which accounts for
 * repo config, starred-only filters, etc.)
 * 
 * For inactive tabs, we can't easily compute their filtered PRs without
 * duplicating a lot of logic, so we just check if the active tab has
 * notifications based on the displayed list.
 */

import { useEffect } from "react"
import { getPRKey } from "../history"
import { getRepoName, type PR, type Tab } from "../types"
import type { History } from "../history"

interface UseTabNotificationsOptions {
  tabs: Tab[]
  activeTabId: string
  /** The already-filtered PRs for the active tab */
  filteredPRs: PR[]
  history: History
  dispatch: (action: any) => void
}

/**
 * Update active tab's notification dot based on displayed PRs
 */
export function useTabNotifications({
  tabs,
  activeTabId,
  filteredPRs,
  history,
  dispatch,
}: UseTabNotificationsOptions) {
  useEffect(() => {
    // Only update the active tab's notification based on what's actually displayed
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab) return

    // Check if any displayed PR has unread activity
    const hasNotification = filteredPRs.some((pr) => {
      const prKey = getPRKey(getRepoName(pr), pr.number)
      return history.prSnapshots?.[prKey]?.hasChanges ?? false
    })

    // Update tab if notification state changed
    if (activeTab.hasNotification !== hasNotification) {
      dispatch({
        type: "UPDATE_TAB_NOTIFICATION",
        tabId: activeTabId,
        hasNotification,
      })
    }
  }, [tabs, activeTabId, filteredPRs, history, dispatch])
}
