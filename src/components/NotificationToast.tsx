/**
 * Notification toast - shows changes to tracked PRs
 * Auto-dismisses after 4 seconds or on any keypress
 * Groups notifications by repository
 */

import { useEffect, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import type { PRChange, ChangeType } from "../notifications"
import { getRepoName } from "../types"

interface NotificationToastProps {
  changes: PRChange[]
  onDismiss: () => void
}

/** Group changes by repository */
interface RepoGroup {
  repo: string
  shortName: string
  changes: PRChange[]
}

function groupByRepo(changes: PRChange[]): RepoGroup[] {
  const groups = new Map<string, PRChange[]>()
  
  for (const change of changes) {
    const repo = getRepoName(change.pr)
    if (!groups.has(repo)) {
      groups.set(repo, [])
    }
    groups.get(repo)!.push(change)
  }
  
  return Array.from(groups.entries()).map(([repo, changes]) => ({
    repo,
    shortName: repo.split("/").pop() ?? repo,
    changes,
  }))
}

export function NotificationToast({ changes, onDismiss }: NotificationToastProps) {
  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  // Dismiss on any key
  useKeyboard(() => {
    onDismiss()
  })

  const groups = useMemo(() => groupByRepo(changes), [changes])

  if (changes.length === 0) return null

  // Count total visible items (repos + their changes, limited)
  let visibleCount = 0
  const maxVisible = 6
  const visibleGroups: RepoGroup[] = []
  
  for (const group of groups) {
    if (visibleCount >= maxVisible) break
    const remainingSlots = maxVisible - visibleCount - 1 // -1 for repo header
    const visibleChanges = group.changes.slice(0, Math.max(1, remainingSlots))
    visibleGroups.push({ ...group, changes: visibleChanges })
    visibleCount += 1 + visibleChanges.length
  }

  const totalChanges = changes.length
  const shownChanges = visibleGroups.reduce((acc, g) => acc + g.changes.length, 0)
  const remaining = totalChanges - shownChanges

  return (
    <box
      position="absolute"
      top={2}
      right={2}
      width={45}
      flexDirection="column"
      backgroundColor={theme.modalBg}
      borderStyle="rounded"
      borderColor={theme.border}
      paddingX={1}
      paddingY={1}
    >
      {visibleGroups.map((group) => (
        <RepoGroupSection key={group.repo} group={group} />
      ))}
      {remaining > 0 && (
        <box paddingLeft={1}>
          <text fg={theme.textMuted}>+ {remaining} more</text>
        </box>
      )}
    </box>
  )
}

function RepoGroupSection({ group }: { group: RepoGroup }) {
  return (
    <box flexDirection="column">
      {/* Repo header */}
      <box height={1}>
        <text>
          <span fg={theme.primary}>{group.shortName}</span>
        </text>
      </box>
      {/* Changes in this repo */}
      {group.changes.map((change) => (
        <NotificationRow key={change.prKey + change.changeType} change={change} />
      ))}
    </box>
  )
}

function NotificationRow({ change }: { change: PRChange }) {
  const icon = getChangeIcon(change.changeType)
  const color = getChangeColor(change.changeType)

  return (
    <box height={1} paddingLeft={1}>
      <text>
        <span fg={color}>{icon}</span>
        {" "}
        <span fg={theme.textDim}>#{change.pr.number}</span>
        {" "}
        <span fg={theme.text}>{truncate(change.pr.title, 18)}</span>
        {" "}
        <span fg={color}>{change.message}</span>
      </text>
    </box>
  )
}

function getChangeIcon(type: ChangeType): string {
  switch (type) {
    case "merged":
      return "◆"
    case "closed":
      return "✕"
    case "approved":
      return "✓"
    case "changes_requested":
      return "!"
    case "ci_passed":
      return "✓"
    case "ci_failed":
      return "✗"
    case "review_requested":
      return "→"
    case "new_comments":
      return "○"
  }
}

function getChangeColor(type: ChangeType): string {
  switch (type) {
    case "merged":
      return theme.prMerged
    case "closed":
      return theme.textDim
    case "approved":
      return theme.success
    case "changes_requested":
      return theme.warning
    case "ci_passed":
      return theme.success
    case "ci_failed":
      return theme.error
    case "review_requested":
      return theme.primary
    case "new_comments":
      return theme.primary
  }
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + "…" : str
}
