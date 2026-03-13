import { theme } from "../theme"

interface HeaderProps {
  title: string
  right?: string
}

export function Header({ title, right }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} justifyContent="space-between">
      <text>
        <span fg={theme.primary}>{title}</span>
      </text>
      {right && (
        <text>
          <span fg={theme.textDim}>{right}</span>
        </text>
      )}
    </box>
  )
}
