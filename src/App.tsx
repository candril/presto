import { useReducer } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { appReducer, initialState } from "./state"
import { theme } from "./theme"

export function App() {
  const renderer = useRenderer()
  const [state, dispatch] = useReducer(appReducer, initialState)

  useKeyboard((key) => {
    if (key.name === "q") {
      renderer.destroy()
      return
    }
  })

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
          <span fg={theme.primary}>q</span>
          <span fg={theme.textDim}> to quit.</span>
        </text>
      </box>
      <StatusBar hints={["q: quit", "?: help"]} />
    </Shell>
  )
}
