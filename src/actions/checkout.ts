/**
 * PR checkout - checkout a PR locally in the repo directory
 */

import { $ } from "bun"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { PR } from "../types"
import { getRepoName } from "../types"
import type { Config } from "../config/schema"
import { loadRiffConfig } from "../config/riff"

/** Expand ~ to home directory */
function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2))
  }
  return path
}

/**
 * Find local path for a repository
 * 
 * Resolution order:
 * 1. Presto per-repo config: repositories[].localPath
 * 2. Riff explicit mapping: storage.repos["owner/repo"]
 * 3. Presto base path: paths.basePath + repo short name
 * 4. Riff base path: storage.basePath + repo short name
 */
export function findLocalPath(
  repoName: string,
  config: Config
): string | null {
  const repoShortName = repoName.split("/")[1] || repoName

  // 1. Check presto per-repo config
  const repoConfig = config.repositories.find((r) => r.name === repoName)
  if (repoConfig?.localPath) {
    const path = expandHome(repoConfig.localPath)
    if (existsSync(path)) return path
  }

  // 2. Check riff explicit mapping
  const riffConfig = loadRiffConfig()
  if (riffConfig?.storage?.repos?.[repoName]) {
    const path = expandHome(riffConfig.storage.repos[repoName])
    if (existsSync(path)) return path
  }

  // 3. Check presto base path
  if (config.paths?.basePath) {
    const path = join(expandHome(config.paths.basePath), repoShortName)
    if (existsSync(path)) return path
  }

  // 4. Check riff base path
  if (riffConfig?.storage?.basePath) {
    const path = join(expandHome(riffConfig.storage.basePath), repoShortName)
    if (existsSync(path)) return path
  }

  return null
}

/** Result of checkout operation */
export interface CheckoutResult {
  success: boolean
  message: string
  branch?: string
}

/**
 * Checkout a PR locally
 * Runs `gh pr checkout` in the local repo directory
 */
export async function checkoutPR(
  pr: PR,
  config: Config
): Promise<CheckoutResult> {
  const repoName = getRepoName(pr)
  const localPath = findLocalPath(repoName, config)

  if (!localPath) {
    return {
      success: false,
      message: `No local path found for ${repoName}. Configure paths.basePath or repository localPath in config.`,
    }
  }

  try {
    // Run checkout in the repo directory
    const result = await $`gh pr checkout ${pr.number} -R ${repoName}`
      .cwd(localPath)
      .text()

    // Extract branch name from output (gh outputs: "Switched to branch 'branch-name'")
    const branchMatch = result.match(/Switched to branch '([^']+)'/)
    const branch = branchMatch?.[1] ?? `pr-${pr.number}`

    return {
      success: true,
      message: `Checked out #${pr.number} → ${branch}`,
      branch,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      message: `Checkout failed: ${errorMsg}`,
    }
  }
}
