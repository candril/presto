import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"
import { loadConfig } from "./config"

// Load configuration
const config = loadConfig()

// Create renderer and mount app
const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App config={config} />)
