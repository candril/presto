# Configuration

**Status**: Done

## Description

Load and manage application configuration from a TOML file. Supports repository settings, tool preferences, keybindings, and appearance options. Configuration is stored in `~/.config/presto/config.toml`.

## Out of Scope

- In-app configuration UI (edit the file directly)
- Cloud sync of settings
- Per-repository config overrides

## Capabilities

### P1 - Must Have

- **Config file location**: `~/.config/presto/config.toml` (XDG compliant)
- **Auto-create defaults**: Create default config if none exists
- **Repository list**: Configure repos to watch
- **GitHub auth**: Use `gh` CLI auth (no separate token needed)

### P2 - Should Have

- **Tool commands**: Customize browser, riff, and custom tool commands
- **Default tool**: Set which tool opens on Enter
- **Refresh interval**: Configure auto-refresh timing
- **Theme selection**: Light/dark/auto theme

### P3 - Nice to Have

- **Keybinding overrides**: Customize keyboard shortcuts
- **Config validation**: Validate and report config errors
- **Config reload**: Hot-reload config without restart

## Technical Notes

### Config File Format

```toml
# ~/.config/presto/config.toml

# Repositories to watch (optional, defaults to current repo)
[[repositories]]
name = "owner/repo"
alias = "main"  # Optional short name

[[repositories]]
name = "owner/other-repo"

# GitHub settings
[github]
# Uses gh CLI auth by default, no token needed
host = "github.com"  # For GitHub Enterprise

# Tool configuration
[tools]
browser = "open"  # macOS default, or "xdg-open" on Linux
riff = "riff"
default = "browser"  # What opens on Enter

# Custom tools
[tools.custom.code]
command = "code --goto {file}"
key = "c"

[tools.custom.lazygit]
command = "lazygit -p {repo_path}"
key = "g"

# Display settings
[display]
theme = "dark"  # dark, light, auto
compact = false  # Compact list view
relative_time = true  # "2h ago" vs timestamp

# Refresh settings
[refresh]
interval = 300  # Seconds, 0 to disable
on_focus = true  # Refresh when terminal gains focus

# Keybindings (override defaults)
[keys]
quit = "q"
open_browser = "o"
open_riff = "r"
copy_url = "y"
search = "/"
refresh = "R"
help = "?"
```

### Config Schema

```typescript
// src/config/schema.ts
export interface Repository {
  name: string        // "owner/repo"
  alias?: string      // Short display name
}

export interface CustomTool {
  command: string     // Command with placeholders
  key?: string        // Keyboard shortcut
  description?: string
}

export interface Config {
  repositories: Repository[]
  
  github: {
    host: string
  }
  
  tools: {
    browser: string
    riff: string
    default: "browser" | "riff" | string
    custom: Record<string, CustomTool>
  }
  
  display: {
    theme: "dark" | "light" | "auto"
    compact: boolean
    relative_time: boolean
  }
  
  refresh: {
    interval: number
    on_focus: boolean
  }
  
  keys: Record<string, string>
}

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
    relative_time: true,
  },
  refresh: {
    interval: 300,
    on_focus: true,
  },
  keys: {
    quit: "q",
    open_browser: "o",
    open_riff: "r",
    copy_url: "y",
    search: "/",
    refresh: "R",
    help: "?",
  },
}
```

### Config Loader

```typescript
// src/config/loader.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { parse } from "@iarna/toml"
import { defaultConfig, type Config } from "./schema"

const CONFIG_DIR = join(homedir(), ".config", "presto")
const CONFIG_FILE = join(CONFIG_DIR, "config.toml")

export function loadConfig(): Config {
  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  
  // Create default config if none exists
  if (!existsSync(CONFIG_FILE)) {
    writeDefaultConfig()
    return defaultConfig
  }
  
  // Load and parse config
  const content = readFileSync(CONFIG_FILE, "utf-8")
  const parsed = parse(content)
  
  // Deep merge with defaults
  return mergeConfig(defaultConfig, parsed)
}

function writeDefaultConfig(): void {
  const content = `# presto configuration
# See: https://github.com/you/presto#configuration

# Repositories to watch (leave empty for current repo only)
# [[repositories]]
# name = "owner/repo"

[tools]
default = "browser"

[display]
theme = "dark"
relative_time = true

[refresh]
interval = 300
`
  writeFileSync(CONFIG_FILE, content)
}

function mergeConfig(defaults: Config, overrides: Partial<Config>): Config {
  return {
    ...defaults,
    ...overrides,
    github: { ...defaults.github, ...overrides.github },
    tools: { ...defaults.tools, ...overrides.tools },
    display: { ...defaults.display, ...overrides.display },
    refresh: { ...defaults.refresh, ...overrides.refresh },
    keys: { ...defaults.keys, ...overrides.keys },
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE
}
```

### Usage in App

```typescript
// src/index.tsx
import { loadConfig } from "./config/loader"

const config = loadConfig()
createRoot(renderer).render(<App config={config} />)
```

## File Structure

```
src/
├── config/
│   ├── schema.ts          # Config types and defaults
│   └── loader.ts          # Load/save config
└── index.tsx              # Load config at startup
```
