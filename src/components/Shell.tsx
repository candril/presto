import type { ReactNode } from "react"
import { theme } from "../theme"

interface ShellProps {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.bg}>
      {children}
    </box>
  )
}
