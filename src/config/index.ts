/**
 * Configuration module for presto
 */

export { loadConfig, getConfigPath, getConfigDir } from "./loader"
export { defaultConfig } from "./schema"
export type { Config, Repository, CustomTool } from "./schema"
