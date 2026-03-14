/**
 * Configuration loader for presto
 * Loads config from ~/.config/presto/config.toml
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parse } from "smol-toml"
import { defaultConfig, type Config, type CustomTool, type Repository } from "./schema"

/** Config directory path */
const CONFIG_DIR = join(homedir(), ".config", "presto")

/** Config file path */
const CONFIG_FILE = join(CONFIG_DIR, "config.toml")

/** Get the config file path */
export function getConfigPath(): string {
  return CONFIG_FILE
}

/** Get the config directory path */
export function getConfigDir(): string {
  return CONFIG_DIR
}

/**
 * Load configuration from disk
 * Creates default config if none exists
 */
export function loadConfig(): Config {
  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }

  // Create default config if none exists
  if (!existsSync(CONFIG_FILE)) {
    writeDefaultConfig()
    return { ...defaultConfig }
  }

  // Load and parse config
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8")
    const parsed = parse(content)
    return mergeConfig(defaultConfig, parsed)
  } catch (err) {
    // On parse error, return defaults but log error
    console.error(`Error loading config: ${err}`)
    return { ...defaultConfig }
  }
}

/** Write the default configuration file */
function writeDefaultConfig(): void {
  const content = `# presto configuration
# See: https://github.com/your/presto#configuration

# Repositories to watch (leave empty for current repo only)
# [[repositories]]
# name = "owner/repo"
# alias = "short-name"  # optional

# GitHub settings (usually not needed, uses gh CLI)
# [github]
# host = "github.example.com"  # For GitHub Enterprise

# Tool configuration
[tools]
default = "browser"  # What opens on Enter: "browser", "riff", or custom tool name
# browser = "open"   # macOS default
# riff = "riff"

# Custom tools (optional)
# [tools.custom.vscode]
# command = "code --goto {file}"
# key = "c"
# description = "Open in VS Code"

# Display settings
[display]
theme = "dark"         # dark, light, auto
compact = false        # Compact list view
relative_time = true   # "2h ago" vs "2024-01-15"

# Refresh settings
[refresh]
interval = 300   # Seconds between auto-refresh (0 to disable)
on_focus = true  # Refresh when terminal gains focus

# Keybinding overrides (optional)
# [keys]
# quit = "q"
# help = "?"
# refresh = "R"
# search = "/"
# open_browser = "o"
# open_riff = "r"
# copy_url = "y"
`
  writeFileSync(CONFIG_FILE, content)
}

/**
 * Deep merge config with defaults
 * User config overrides defaults
 */
function mergeConfig(defaults: Config, overrides: Record<string, unknown>): Config {
  return {
    repositories: parseRepositories(overrides.repositories),

    github: {
      ...defaults.github,
      ...parseObject(overrides.github),
    },

    tools: {
      ...defaults.tools,
      ...parseObject(overrides.tools),
      custom: parseCustomTools(overrides.tools),
    },

    display: {
      ...defaults.display,
      ...parseDisplay(overrides.display),
    },

    refresh: {
      ...defaults.refresh,
      ...parseRefresh(overrides.refresh),
    },

    notifications: {
      ...defaults.notifications,
      ...parseNotifications(overrides.notifications),
    },

    keys: {
      ...defaults.keys,
      ...parseKeys(overrides.keys),
    },
  }
}

/** Parse notifications settings */
function parseNotifications(value: unknown): Partial<Config["notifications"]> {
  if (typeof value !== "object" || value === null) return {}
  const obj = value as Record<string, unknown>
  const result: Partial<Config["notifications"]> = {}
  if (typeof obj.desktop === "boolean") result.desktop = obj.desktop
  return result
}

/** Parse repositories array from TOML */
function parseRepositories(value: unknown): Repository[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      name: String(item.name || ""),
      alias: item.alias ? String(item.alias) : undefined,
      starredOnly: item.starredOnly === true,
      disabled: item.disabled === true,
    }))
    .filter((repo) => repo.name.length > 0)
}

/** Parse custom tools from TOML */
function parseCustomTools(tools: unknown): Record<string, CustomTool> {
  if (typeof tools !== "object" || tools === null) return {}

  const toolsObj = tools as Record<string, unknown>
  const custom = toolsObj.custom

  if (typeof custom !== "object" || custom === null) return {}

  const result: Record<string, CustomTool> = {}
  const customObj = custom as Record<string, unknown>

  for (const [name, value] of Object.entries(customObj)) {
    if (typeof value === "object" && value !== null) {
      const tool = value as Record<string, unknown>
      result[name] = {
        command: String(tool.command || ""),
        key: tool.key ? String(tool.key) : undefined,
        description: tool.description ? String(tool.description) : undefined,
      }
    }
  }

  return result
}

/** Parse display settings, handling snake_case to camelCase */
function parseDisplay(value: unknown): Partial<Config["display"]> {
  if (typeof value !== "object" || value === null) return {}

  const obj = value as Record<string, unknown>
  const result: Partial<Config["display"]> = {}

  if (obj.theme === "dark" || obj.theme === "light" || obj.theme === "auto") {
    result.theme = obj.theme
  }
  if (typeof obj.compact === "boolean") {
    result.compact = obj.compact
  }
  // Handle both snake_case (TOML) and camelCase
  if (typeof obj.relative_time === "boolean") {
    result.relativeTime = obj.relative_time
  }
  if (typeof obj.relativeTime === "boolean") {
    result.relativeTime = obj.relativeTime
  }

  return result
}

/** Parse refresh settings, handling snake_case to camelCase */
function parseRefresh(value: unknown): Partial<Config["refresh"]> {
  if (typeof value !== "object" || value === null) return {}

  const obj = value as Record<string, unknown>
  const result: Partial<Config["refresh"]> = {}

  if (typeof obj.interval === "number") {
    result.interval = obj.interval
  }
  // Handle both snake_case (TOML) and camelCase
  if (typeof obj.on_focus === "boolean") {
    result.onFocus = obj.on_focus
  }
  if (typeof obj.onFocus === "boolean") {
    result.onFocus = obj.onFocus
  }

  return result
}

/** Safely parse an object */
function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {}
  return value as Record<string, unknown>
}

/** Parse keys config (string values only) */
function parseKeys(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {}

  const result: Record<string, string> = {}
  const obj = value as Record<string, unknown>

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      result[key] = val
    }
  }

  return result
}
