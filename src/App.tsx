import { useReducer } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { appReducer, initialState } from "./state"
import { theme } from "./theme"
import type { Config } from "./config"

interface AppProps {
  config: Config
}

export function App({ config }: AppProps) {
  const renderer = useRenderer()
  const [state, dispatch] = useReducer(appReducer, initialState)

  useKeyboard((key) => {
    // Use configured quit key (default: "q")
    if (key.name === config.keys.quit) {
      renderer.destroy()
      return
    }
  })

  // Build status hints from config keys
  const hints = [
    `${config.keys.quit}: quit`,
    `${config.keys.help}: help`,
  ]

  return (
    <Shell>
      <Header title="presto" />
      <box flexGrow={1} paddingX={1} paddingY={1}>
        <text>
          <span fg={theme.text}>Welcome to presto</span>
          {"\n\n"}
          <span fg={theme.textDim}>A terminal-based pull request discovery tool.</span>
          {"\n"}
          <span fg={theme.textDim}>Press </span>
          <span fg={theme.primary}>{config.keys.quit}</span>
          <span fg={theme.textDim}> to quit.</span>
          {"\n\n"}
          <span fg={theme.textMuted}>Config: {config.display.theme} theme, refresh every {config.refresh.interval}s</span>
        </text>
      </box>
      <StatusBar hints={hints} />
    </Shell>
  )
}
