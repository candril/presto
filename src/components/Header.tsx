import { theme } from "../theme"
import { Spinner } from "./Loading"

interface HeaderProps {
  title: string
  /** Whether data is being loaded/refreshed */
  loading?: boolean
  /** Right side content (e.g., count) */
  right?: string
}

export function Header({ title, loading, right }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Left side: Title */}
      <text>
        <span fg={theme.primary}>{title}</span>
      </text>

      {/* Spacer pushes right content to far right */}
      <box flexGrow={1} />

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
