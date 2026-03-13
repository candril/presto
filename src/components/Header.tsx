import { theme } from "../theme"

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1}>
      <text>
        <span fg={theme.primary}>{title}</span>
      </text>
    </box>
  )
}
