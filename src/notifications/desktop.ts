/**
 * Desktop notifications - send native OS notifications
 * 
 * macOS: Uses terminal-notifier (if available) or osascript
 * Linux: Uses notify-send (libnotify)
 */

import { $ } from "bun"
import type { PRChange } from "./types"

export interface DesktopNotification {
  title: string
  subtitle?: string
  message: string
}

/** Send a desktop notification (platform-aware) */
export async function sendDesktopNotification(
  notification: DesktopNotification
): Promise<void> {
  const { title, subtitle, message } = notification

  try {
    switch (process.platform) {
      case "darwin":
        await notifyMacOS(title, subtitle ?? "", message)
        break
      case "linux":
        // Linux notify-send doesn't have subtitle, combine them
        const fullTitle = subtitle ? `${title}: ${subtitle}` : title
        await notifyLinux(fullTitle, message)
        break
      default:
        // Unsupported platform, silently skip
        break
    }
  } catch {
    // Silently fail - notifications are best-effort
  }
}

/** macOS notification via terminal-notifier or osascript */
async function notifyMacOS(
  title: string,
  subtitle: string,
  message: string
): Promise<void> {
  // Try terminal-notifier first (better UX, more features)
  try {
    await $`which terminal-notifier`.quiet()
    await $`terminal-notifier -title ${title} -subtitle ${subtitle} -message ${message} -group presto`.quiet()
    return
  } catch {
    // Fall through to osascript
  }

  // osascript fallback (always available on macOS)
  const script = subtitle
    ? `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}" subtitle "${escapeAppleScript(subtitle)}"`
    : `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"`

  await $`osascript -e ${script}`.quiet()
}

/** Linux notification via notify-send */
async function notifyLinux(title: string, message: string): Promise<void> {
  await $`notify-send ${title} ${message} --app-name=PResto`.quiet()
}

/** Escape string for AppleScript */
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/** Convert PR changes to desktop notification */
export function formatChangesForDesktop(
  changes: PRChange[]
): DesktopNotification | null {
  if (changes.length === 0) return null

  if (changes.length === 1) {
    const change = changes[0]
    return {
      title: "PResto",
      subtitle: `#${change.pr.number} ${change.message}`,
      message: truncate(change.pr.title, 50),
    }
  }

  // Multiple changes - summarize
  const summary = summarizeChanges(changes)
  return {
    title: "PResto",
    subtitle: `${changes.length} updates`,
    message: summary,
  }
}

/** Summarize multiple changes into a short message */
function summarizeChanges(changes: PRChange[]): string {
  // Group by type
  const byType = new Map<string, number>()
  for (const c of changes) {
    byType.set(c.changeType, (byType.get(c.changeType) || 0) + 1)
  }

  const parts: string[] = []
  const approved = byType.get("approved")
  const ciPassed = byType.get("ci_passed")
  const ciFailed = byType.get("ci_failed")
  const merged = byType.get("merged")
  const comments = byType.get("new_comments")
  const changesRequested = byType.get("changes_requested")

  if (approved) parts.push(`${approved} approved`)
  if (ciPassed) parts.push(`${ciPassed} CI passed`)
  if (ciFailed) parts.push(`${ciFailed} CI failed`)
  if (merged) parts.push(`${merged} merged`)
  if (comments) parts.push(`${comments} with comments`)
  if (changesRequested) parts.push(`${changesRequested} need changes`)

  return parts.join(", ") || `${changes.length} PR updates`
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + "…" : str
}
