# Desktop Notifications

**Status**: Done

## Description

Send native desktop notifications for important PR changes. When a tracked PR changes state (approved, CI failed, merged, etc.), show a system notification in addition to the in-app toast.

This extends spec 016 (Smart Notifications) to also trigger OS-level notifications.

## Out of Scope

- Windows support (P3 at best, complex implementation)
- Custom notification sounds
- Notification actions/buttons (click to open PR)
- Notification center/history integration

## Capabilities

### P1 - Must Have (macOS)

- **macOS notifications**: Use `terminal-notifier` or `osascript` 
- **Notification content**: Title, subtitle, message matching in-app toast
- **Grouping**: Group notifications by app to avoid spam
- **Configurable**: Enable/disable in config

### P2 - Should Have (Linux)

- **Linux notifications**: Use `notify-send` (libnotify)
- **Fallback chain**: Try `notify-send`, then `osascript`, then skip silently

### P3 - Nice to Have

- **Click to open**: Open PR in browser when notification clicked
- **Sound**: Play sound on important notifications (CI fail, approved)
- **Do Not Disturb**: Respect system DND settings

## Technical Notes

### Platform Detection

```typescript
// src/notifications/desktop.ts
import { $ } from "bun"

type Platform = "darwin" | "linux" | "unknown"

function getPlatform(): Platform {
  switch (process.platform) {
    case "darwin": return "darwin"
    case "linux": return "linux"
    default: return "unknown"
  }
}
```

### macOS Implementation

Two options, in order of preference:

1. **terminal-notifier** (if installed) - More features, better UX
2. **osascript** (built-in) - Always available fallback

```typescript
async function notifyMacOS(title: string, subtitle: string, message: string): Promise<void> {
  // Try terminal-notifier first (better UX)
  try {
    await $`which terminal-notifier`.quiet()
    await $`terminal-notifier -title ${title} -subtitle ${subtitle} -message ${message} -group presto`.quiet()
    return
  } catch {
    // Fall back to osascript
  }
  
  // osascript fallback (always available on macOS)
  await $`osascript -e ${"display notification \"" + message + "\" with title \"" + title + "\" subtitle \"" + subtitle + "\""}`
}
```

### Linux Implementation

```typescript
async function notifyLinux(title: string, message: string): Promise<void> {
  // notify-send is standard on most Linux desktops
  try {
    await $`notify-send ${title} ${message} --app-name=presto`.quiet()
  } catch {
    // Silently fail if no notification daemon
  }
}
```

### Unified API

```typescript
// src/notifications/desktop.ts
import { $ } from "bun"
import type { PRChange } from "./types"

export interface DesktopNotification {
  title: string
  subtitle?: string
  message: string
}

/** Send a desktop notification (platform-aware) */
export async function sendDesktopNotification(notification: DesktopNotification): Promise<void> {
  const { title, subtitle, message } = notification
  
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
}

/** Convert PR changes to desktop notification */
export function formatChangesForDesktop(changes: PRChange[]): DesktopNotification | null {
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

function summarizeChanges(changes: PRChange[]): string {
  // Group by type
  const byType = new Map<string, number>()
  for (const c of changes) {
    byType.set(c.changeType, (byType.get(c.changeType) || 0) + 1)
  }
  
  const parts: string[] = []
  if (byType.get("approved")) parts.push(`${byType.get("approved")} approved`)
  if (byType.get("ci_passed")) parts.push(`${byType.get("ci_passed")} CI passed`)
  if (byType.get("ci_failed")) parts.push(`${byType.get("ci_failed")} CI failed`)
  if (byType.get("merged")) parts.push(`${byType.get("merged")} merged`)
  if (byType.get("new_comments")) parts.push(`${byType.get("new_comments")} with comments`)
  
  return parts.join(", ") || `${changes.length} PR updates`
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + "…" : str
}
```

### Configuration

```toml
# In config.toml
[notifications]
# Enable desktop notifications (default: true)
desktop = true
```

```typescript
// src/config/schema.ts
export interface Config {
  // ... existing
  notifications: {
    /** Send desktop notifications */
    desktop: boolean
  }
}

export const defaultConfig: Config = {
  // ...
  notifications: {
    desktop: true,
  },
}
```

### Integration with App

```typescript
// In App.tsx, after detecting changes:
if (changes.length > 0 && config.notifications.desktop) {
  const notification = formatChangesForDesktop(changes)
  if (notification) {
    sendDesktopNotification(notification)
  }
}
```

## File Structure

```
src/
├── notifications/
│   ├── index.ts              # Add exports
│   └── desktop.ts            # NEW: Desktop notification sender
├── config/
│   └── schema.ts             # Add notifications config
└── App.tsx                   # Wire up desktop notifications
```

## Examples

### Single Change
```
┌─────────────────────────────────┐
│ PResto                          │
│ #123 was approved               │
│ Add user authentication         │
└─────────────────────────────────┘
```

### Multiple Changes
```
┌─────────────────────────────────┐
│ PResto                          │
│ 3 updates                       │
│ 2 approved, 1 CI failed         │
└─────────────────────────────────┘
```

## Testing

```bash
# Test macOS with terminal-notifier
terminal-notifier -title "PResto" -subtitle "#123 was approved" -message "Add auth" -group presto

# Test macOS with osascript
osascript -e 'display notification "Add auth" with title "PResto" subtitle "#123 was approved"'

# Test Linux
notify-send "PResto: #123 was approved" "Add auth" --app-name=presto
```
