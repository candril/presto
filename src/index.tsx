import { createCliRenderer, ConsolePosition } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { App } from "./App"
import { loadConfig, defaultConfig, type Config } from "./config"
import { getCurrentUser, initSource, usePRSource } from "./providers"
import { createDemoSource, demoRepositories } from "./providers/demo"
import { setupFocusReporting, type FocusCallback } from "./utils/focus-reporting"
import { initBotPatterns } from "./utils/bots"
import pkg from "../package.json"

const args = process.argv.slice(2)

if (args.includes("--help") || args.includes("-h")) {
  console.log(`presto — pull requests in the terminal

Usage: presto [--demo]

  --demo         run against a built-in demo org: no gh, no network, no config,
                 nothing written to ~/.config/presto
  -v, --version  print the version
  -h, --help     this text

Config: ~/.config/presto/config.toml (PRESTO_CONFIG_DIR overrides the directory)
Docs:   https://candril.github.io/presto/`)
  process.exit(0)
}
if (args.includes("--version") || args.includes("-v")) {
  console.log(`presto ${pkg.version}`)
  process.exit(0)
}

const demo = args.includes("--demo")

/**
 * The demo never touches the real config directory: history, cache and tabs go to a
 * scratch directory that is wiped on every launch, so it starts the same way each time.
 */
function demoConfig(): Config {
  const dir = process.env.PRESTO_CONFIG_DIR || join(tmpdir(), "presto-demo")
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  process.env.PRESTO_CONFIG_DIR = dir
  usePRSource(createDemoSource(), { demo: true })
  return {
    ...defaultConfig,
    repositories: demoRepositories(),
    notifications: { desktop: false },
  }
}

const config = demo ? demoConfig() : loadConfig()

// Initialize bot patterns from config
initBotPatterns(config.botPatterns.patterns)

// Initialize GitHub API (pre-warm token cache for faster first fetch)
const [currentUser] = await Promise.all([
  getCurrentUser().catch(() => null),
  initSource().catch(() => {}),
])

// Create renderer and mount app
const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useConsole: true,
  consoleOptions: {
    position: ConsolePosition.BOTTOM,
    sizePercent: 30,
    title: "presto console",
  },
})

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
