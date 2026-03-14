/**
 * Notification toast - shows changes to tracked PRs
 * Auto-dismisses after 4 seconds or on any keypress
 */

import { useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import type { PRChange, ChangeType } from "../notifications"

interface NotificationToastProps {
  changes: PRChange[]
  onDismiss: () => void
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

  if (changes.length === 0) return null

  const visible = changes.slice(0, 5)
  const remaining = changes.length - visible.length

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
      {visible.map((change) => (
        <NotificationRow key={change.prKey + change.changeType} change={change} />
      ))}
      {remaining > 0 && (
        <box paddingLeft={1}>
          <text fg={theme.textMuted}>+ {remaining} more</text>
        </box>
      )}
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
