import { theme } from "../theme"

interface StatusBarProps {
  hints: string[]
}

export function StatusBar({ hints }: StatusBarProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1}>
      <text>
        <span fg={theme.textDim}>{hints.join("  ")}</span>
      </text>
    </box>
  )
}
