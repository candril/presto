import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"
import { loadConfig } from "./config"
import { getCurrentUser } from "./providers/github"
import { initGraphQL } from "./providers/graphql"
import { setupFocusReporting, type FocusCallback } from "./utils/focus-reporting"

// Load configuration
const config = loadConfig()

// Initialize GitHub API (pre-warm token cache for faster first fetch)
const [currentUser] = await Promise.all([
  getCurrentUser().catch(() => null),
  initGraphQL().catch(() => {}),
])

// Create renderer and mount app
const renderer = await createCliRenderer({ exitOnCtrlC: false })

// Set up terminal focus reporting for tmux/terminal window switches
const focusCallbacks: FocusCallback[] = []
const cleanupFocus = setupFocusReporting(renderer, (focused) => {
  for (const cb of focusCallbacks) {
    cb(focused)
  }
})

// Register callback for focus events (App will use this)
const registerFocusCallback = (cb: FocusCallback) => {
  focusCallbacks.push(cb)
  return () => {
    const idx = focusCallbacks.indexOf(cb)
    if (idx >= 0) focusCallbacks.splice(idx, 1)
  }
}

createRoot(renderer).render(
  <App
    config={config}
    currentUser={currentUser}
    onFocusChange={registerFocusCallback}
  />
)
