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
 * Copy text to clipboard
 * Uses pbcopy on macOS, xclip on Linux
 */
async function copyToClipboard(text: string): Promise<void> {
  if (process.platform === "darwin") {
    await $`printf ${text} | pbcopy`.quiet()
  } else {
    // Linux - try xclip first, fall back to xsel
    try {
      await $`printf ${text} | xclip -selection clipboard`.quiet()
    } catch {
      await $`printf ${text} | xsel --clipboard`.quiet()
    }
  }
}

/**
 * Copy PR URL to clipboard
 */
export async function copyPRUrl(pr: PR): Promise<void> {
  await copyToClipboard(pr.url)
}

/**
 * Copy PR number to clipboard (e.g., "#123")
 */
export async function copyPRNumber(pr: PR): Promise<void> {
  await copyToClipboard(`#${pr.number}`)
}
