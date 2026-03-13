import { theme } from "../theme"

interface HeaderProps {
  title: string
  right?: string
}

export function Header({ title, right }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      <box flexGrow={1}>
        <text>
          <span fg={theme.primary}>{title}</span>
        </text>
      </box>
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
