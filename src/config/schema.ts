/**
 * Configuration schema for presto
 * Config file location: ~/.config/presto/config.toml
 */

/** Repository to watch for PRs */
export interface Repository {
  /** Full repo name: "owner/repo" */
  name: string
  /** Optional short display name */
  alias?: string
}

/** Custom tool definition */
export interface CustomTool {
  /** Command with placeholders: {repo}, {number}, {url}, {branch} */
  command: string
  /** Keyboard shortcut */
  key?: string
  /** Description shown in actions menu */
  description?: string
}

/** Main configuration interface */
export interface Config {
  /** Repositories to watch (empty = current repo only) */
  repositories: Repository[]

  /** GitHub settings */
  github: {
    /** GitHub host (for Enterprise) */
    host: string
  }

  /** Tool configuration */
  tools: {
    /** Browser command */
    browser: string
    /** Riff command */
    riff: string
    /** Default tool on Enter: "browser" | "riff" | custom tool name */
    default: string
    /** Custom tools */
    custom: Record<string, CustomTool>
  }

  /** Display settings */
  display: {
    /** Color theme */
    theme: "dark" | "light" | "auto"
    /** Use compact list view */
    compact: boolean
    /** Show relative time ("2h ago" vs timestamp) */
    relativeTime: boolean
  }

  /** Refresh settings */
  refresh: {
    /** Auto-refresh interval in seconds (0 to disable) */
    interval: number
    /** Refresh when terminal gains focus */
    onFocus: boolean
  }

  /** Keybinding overrides */
  keys: Record<string, string>
}

/** Default configuration values */
export const defaultConfig: Config = {
  repositories: [],

  github: {
    host: "github.com",
  },

  tools: {
    browser: process.platform === "darwin" ? "open" : "xdg-open",
    riff: "riff",
    default: "browser",
    custom: {},
  },

  display: {
    theme: "dark",
    compact: false,
    relativeTime: true,
  },

  refresh: {
    interval: 300, // 5 minutes
    onFocus: true,
  },

  keys: {
    quit: "q",
    help: "?",
    refresh: "R",
    search: "/",
    openBrowser: "o",
    openRiff: "r",
    copyUrl: "y",
    actionsMenu: "a",
  },
}
