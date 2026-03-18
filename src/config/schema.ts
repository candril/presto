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
  /** Only show PRs from starred authors (default: false) */
  starredOnly?: boolean
  /** Don't fetch by default, only when explicitly filtered with repo:name (default: false) */
  disabled?: boolean
  /** Local path to the repo clone (for checkout feature) */
  localPath?: string
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

/** Paths configuration for local repos */
export interface PathsConfig {
  /** Base folder where repos are typically cloned (e.g., ~/Development) */
  basePath?: string
}

/** Bot filtering configuration */
export interface BotPatternsConfig {
  /** Additional regex patterns to identify bot accounts */
  patterns?: string[]
}

/** Main configuration interface */
export interface Config {
  /** Repositories to watch (empty = current repo only) */
  repositories: Repository[]

  /** Paths configuration */
  paths: PathsConfig

  /** Bot filtering - exclude from comment counts */
  botPatterns: BotPatternsConfig

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

  /** Notification settings */
  notifications: {
    /** Send desktop notifications for PR changes */
    desktop: boolean
  }

  /** 
   * Keybinding overrides
   * 
   * Keys are action names like "nav.down", "action.browser", "ui.quit"
   * Values are key combinations like "j", "ctrl+p", "G" (shift+g)
   * 
   * See src/keybindings/defaults.ts for all available actions
   */
  keys: Record<string, string>
}

/** Default configuration values */
export const defaultConfig: Config = {
  repositories: [],

  paths: {},

  botPatterns: {},

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

  notifications: {
    desktop: false,
  },

  keys: {},
}
