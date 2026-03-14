import { theme } from "../theme"
import { Spinner } from "./Loading"
import { formatRelativeTime } from "../hooks/useAutoRefresh"

interface HeaderProps {
  title: string
  /** Whether data is being loaded/refreshed */
  loading?: boolean
  /** Right side content (e.g., count) */
  right?: string
  /** Last refresh timestamp */
  lastRefresh?: Date | null
  /** Data is stale (older than 2x refresh interval) */
  isStale?: boolean
}

export function Header({ title, loading, right, lastRefresh, isStale }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Left side: Title */}
      <text>
        <span fg={theme.primary}>{title}</span>
      </text>

      {/* Spacer pushes right content to far right */}
      <box flexGrow={1} />

      {/* Last refresh time (only when not loading) */}
      {!loading && lastRefresh && (
        <box marginRight={2}>
          <text>
            <span fg={isStale ? theme.warning : theme.textMuted}>
              {isStale ? "! " : ""}
              {formatRelativeTime(lastRefresh)}
            </span>
          </text>
        </box>
      )}

      {/* Right side: loading indicator and count - always at far right */}
      {loading && (
        <box marginRight={1}>
          <Spinner />
        </box>
      )}
      {right && (
        <text>
          <span fg={theme.textDim}>{right}</span>
        </text>
      )}
    </box>
  )
}
