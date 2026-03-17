/**
 * Tab bar component - shows tabs when there are more than one
 */

import { theme } from "../theme"
import type { Tab } from "../tabs"
import { generateTabTitle } from "../tabs/title"
import type { Repository } from "../config/schema"

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  repositories?: Repository[]
}

export function TabBar({ tabs, activeTabId, onTabChange, repositories }: TabBarProps) {
  // Don't render if only one tab
  if (tabs.length <= 1) {
    return null
  }

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={theme.headerBg}
      flexDirection="row"
      paddingLeft={1}
      gap={2}
    >
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.id}
          tab={tab}
          index={index + 1}
          active={tab.id === activeTabId}
          repositories={repositories}
        />
      ))}
    </box>
  )
}

interface TabItemProps {
  tab: Tab
  index: number
  active: boolean
  repositories?: Repository[]
}

function TabItem({ tab, index, active, repositories }: TabItemProps) {
  // Compute title with config for alias lookup
  const title = tab.titleOverride ?? generateTabTitle(tab.filterQuery, { repositories })
  // Use fixed-width prefix for notification dot to prevent layout shift
  const dotPrefix = tab.hasNotification ? "• " : "  "

  return (
    <text fg={active ? theme.primary : theme.textDim}>
      <span fg={theme.primary}>{dotPrefix}</span>
      <span fg={theme.textMuted}>{index}</span>
      <span fg={theme.textMuted}>:</span>
      {title}
    </text>
  )
}
