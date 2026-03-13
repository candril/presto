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
      <text>
        <span fg={theme.primary}>{title}</span>
      </text>
      <box flexGrow={1} />
      {loading && (
        <box marginRight={1}>
          <Spinner />
        </box>
      )}
      {right && (
        <box>
          <text>
            <span fg={theme.textDim}>{right}</span>
          </text>
        </box>
      )}
    </box>
  )
}
