/**
 * Configuration loader for presto
 * Loads config from ~/.config/presto/config.toml
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parse } from "smol-toml"
import { defaultConfig, type Config, type CustomTool, type Repository } from "./schema"

/**
 * Resolved on every call rather than at import: `--demo` points this at a scratch
 * directory after the modules are loaded, and the cache, history and tabs files all
 * hang off it.
 */
export function getConfigDir(): string {
  return process.env.PRESTO_CONFIG_DIR || join(homedir(), ".config", "presto")
}

/** Get the config file path */
export function getConfigPath(): string {
  return join(getConfigDir(), "config.toml")
}

/**
 * Load configuration from disk
 * Creates default config if none exists
 */
export function loadConfig(): Config {
  const configDir = getConfigDir()
  const configFile = getConfigPath()

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Create default config if none exists
  if (!existsSync(configFile)) {
    writeDefaultConfig(configFile)
    return { ...defaultConfig }
  }

  // Load and parse config
  try {
    const content = readFileSync(configFile, "utf-8")
    const parsed = parse(content)
    return mergeConfig(defaultConfig, parsed)
  } catch (err) {
    // On parse error, return defaults but log error
    console.error(`Error loading config: ${err}`)
    return { ...defaultConfig }
  }
}

/** Write the default configuration file */
function writeDefaultConfig(configFile: string): void {
  const content = `# presto configuration
# See: https://candril.github.io/presto/reference/configuration/

# Repositories to watch (leave empty for the current repo only)
# [[repositories]]
# name = "owner/repo"
# alias = "short-name"    # optional, used in tab titles
# starred_only = false    # only PRs from authors you have starred
# disabled = false        # fetch only when filtered with repo:name
# local_path = "~/code/repo"  # for checkout (space)

# Where repos are cloned, for checkout: base_path/<repo short name>
# [paths]
# base_path = "~/code"

# The pager the diff (D) is piped into: "auto" picks delta, then bat, then less
[tools]
diff = "auto"

# Refresh settings
[refresh]
interval = 300   # Seconds between auto-refresh (0 to disable)
on_focus = true  # Refresh when terminal gains focus

# Desktop notifications when a refresh finds changes
[notifications]
desktop = false

# Bot patterns - exclude accounts from comment counts, threads and approvals (optional)
# These are regex patterns matched against logins
# Default patterns already cover: [bot], dependabot, renovate, codecov, etc.
# [bot_patterns]
# patterns = ["-ci$", "^my-internal-bot$"]

# Keybinding overrides (optional) — action names from src/keybindings/defaults.ts
# [keys]
# "action.open" = "return"
# "action.browser" = "o"
# "ui.commandPalette" = "ctrl+p"
# "action.forceRefresh" = "R"    # uppercase = shift
`
  writeFileSync(configFile, content)
}

/**
 * Deep merge config with defaults
 * User config overrides defaults
 */
function mergeConfig(defaults: Config, overrides: Record<string, unknown>): Config {
  return {
    repositories: parseRepositories(overrides.repositories),

    paths: {
      ...defaults.paths,
      ...parsePaths(overrides.paths),
    },

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

    botPatterns: {
      ...defaults.botPatterns,
      ...parseBotPatterns(overrides.bot_patterns ?? overrides.botPatterns),
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

/** Parse bot patterns settings */
function parseBotPatterns(value: unknown): Partial<Config["botPatterns"]> {
  if (typeof value !== "object" || value === null) return {}
  const obj = value as Record<string, unknown>
  const result: Partial<Config["botPatterns"]> = {}
  
  if (Array.isArray(obj.patterns)) {
    result.patterns = obj.patterns.filter((p): p is string => typeof p === "string")
  }
  
  return result
}

/** Parse paths settings */
function parsePaths(value: unknown): Partial<Config["paths"]> {
  if (typeof value !== "object" || value === null) return {}
  const obj = value as Record<string, unknown>
  const result: Partial<Config["paths"]> = {}
  // Handle both snake_case (TOML) and camelCase
  if (typeof obj.base_path === "string") result.basePath = obj.base_path
  if (typeof obj.basePath === "string") result.basePath = obj.basePath
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
      starredOnly: item.starredOnly === true || item.starred_only === true,
      disabled: item.disabled === true,
      // Handle both snake_case (TOML) and camelCase
      localPath: item.local_path ? String(item.local_path) : item.localPath ? String(item.localPath) : undefined,
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
