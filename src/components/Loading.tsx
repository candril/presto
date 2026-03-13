/**
 * Loading spinner component
 */

import { useState, useEffect } from "react"
import { theme } from "../theme"

interface LoadingProps {
  message?: string
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Loading({ message = "Loading..." }: LoadingProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <text>
        <span fg={theme.primary}>{SPINNER_FRAMES[frame]}</span>
        <span fg={theme.textDim}> {message}</span>
      </text>
    </box>
  )
}
