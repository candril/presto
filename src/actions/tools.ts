/**
 * External tools - open PRs in browser, riff, or copy URL
 */

import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName } from "../types"

/**
 * Open PR in default browser using gh CLI
 */
export async function openInBrowser(pr: PR): Promise<void> {
  const repo = getRepoName(pr)
  await $`gh pr view ${pr.number} -R ${repo} --web`.quiet()
}

/**
 * Open PR in riff for code review
 * Spawns riff with full terminal inheritance
 */
export async function openInRiff(pr: PR): Promise<void> {
  const repo = getRepoName(pr)
  const target = `gh:${repo}#${pr.number}`
  
  // Use Bun.spawn with inherit for proper terminal handling
  const proc = Bun.spawn(["riff", target], {
    stdin: "inherit",
    stdout: "inherit", 
    stderr: "inherit",
  })
  
  await proc.exited
}

/**
 * Copy PR URL to clipboard
 * Uses pbcopy on macOS, xclip on Linux
 */
export async function copyPRUrl(pr: PR): Promise<void> {
  const url = pr.url
  
  if (process.platform === "darwin") {
    await $`printf ${url} | pbcopy`.quiet()
  } else {
    // Linux - try xclip first, fall back to xsel
    try {
      await $`printf ${url} | xclip -selection clipboard`.quiet()
    } catch {
      await $`printf ${url} | xsel --clipboard`.quiet()
    }
  }
}
