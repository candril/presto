/**
 * Riff configuration loader
 * Reads ~/.config/riff/config.toml for repo mappings
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { parse } from "smol-toml"

/** Riff configuration (subset we care about) */
export interface RiffConfig {
  storage?: {
    /** Base path to search for repos by name */
    basePath?: string
    /** Explicit repo mappings: "owner/repo" -> "/local/path" */
    repos?: Record<string, string>
  }
}

/** Riff config file path */
const RIFF_CONFIG_PATH = join(homedir(), ".config", "riff", "config.toml")

/** Cached config to avoid re-reading */
let cachedConfig: RiffConfig | null = null
let cacheTime = 0
const CACHE_TTL = 60_000 // 1 minute

/**
 * Load riff configuration from disk
 * Returns null if config doesn't exist or can't be parsed
 */
export function loadRiffConfig(): RiffConfig | null {
  // Check cache
  const now = Date.now()
  if (cachedConfig !== null && now - cacheTime < CACHE_TTL) {
    return cachedConfig
  }

  if (!existsSync(RIFF_CONFIG_PATH)) {
    cachedConfig = null
    cacheTime = now
    return null
  }

  try {
    const content = readFileSync(RIFF_CONFIG_PATH, "utf-8")
    const parsed = parse(content) as Record<string, unknown>
    
    const config: RiffConfig = {}
    
    // Parse storage section
    if (typeof parsed.storage === "object" && parsed.storage !== null) {
      const storage = parsed.storage as Record<string, unknown>
      config.storage = {}
      
      if (typeof storage.basePath === "string") {
        config.storage.basePath = storage.basePath
      }
      
      if (typeof storage.repos === "object" && storage.repos !== null) {
        config.storage.repos = {}
        for (const [key, value] of Object.entries(storage.repos)) {
          if (typeof value === "string") {
            config.storage.repos[key] = value
          }
        }
      }
    }
    
    cachedConfig = config
    cacheTime = now
    return config
  } catch {
    cachedConfig = null
    cacheTime = now
    return null
  }
}

/** Clear the cached config (useful for testing) */
export function clearRiffConfigCache(): void {
  cachedConfig = null
  cacheTime = 0
}
