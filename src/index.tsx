import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"
import { loadConfig } from "./config"
import { getCurrentUser } from "./providers/github"

// Load configuration
const config = loadConfig()

// Get current GitHub user (for @me filter)
const currentUser = await getCurrentUser().catch(() => null)

// Create renderer and mount app
const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App config={config} currentUser={currentUser} />)
