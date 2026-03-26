/**
 * External tools - open PRs in browser, riff, diff viewer, or copy URL
 */

import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName } from "../types"

/** Cached diff command (resolved once from "auto") */
let resolvedDiffCommand: string | null = null

/**
 * Open PR in default browser using gh CLI
 */
export async function openInBrowser(pr: PR): Promise<void> {
  const repo = getRepoName(pr)
  await $`gh pr view ${pr.number} -R ${repo} --web`.quiet()
}

/**
 * Open a repository's GitHub page in the browser
 */
export async function openRepoInBrowser(pr: PR): Promise<void> {
  const repo = getRepoName(pr)
  await $`gh repo view ${repo} --web`.quiet()
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

/**
 * Resolve the diff viewer command.
 * "auto" → detect delta, then bat, then less.
 * Any other string is used as-is.
 */
async function resolveDiffCommand(configured: string): Promise<string> {
  if (configured !== "auto") return configured
  if (resolvedDiffCommand) return resolvedDiffCommand

  // Try delta
  try {
    await $`command -v delta`.quiet()
    resolvedDiffCommand = "delta --paging=always"
    return resolvedDiffCommand
  } catch { /* not found */ }

  // Try bat
  try {
    await $`command -v bat`.quiet()
    resolvedDiffCommand = "bat -l diff --paging=always"
    return resolvedDiffCommand
  } catch { /* not found */ }

  // Fallback to less
  resolvedDiffCommand = "less -R"
  return resolvedDiffCommand
}

/**
 * View PR diff in an external viewer.
 * Pipes `gh pr diff` through the configured diff tool (delta, bat, less, etc.).
 * The caller is responsible for suspending/resuming the TUI.
 */
export async function openDiff(pr: PR, diffCommand: string): Promise<void> {
  const repo = getRepoName(pr)
  const cmd = await resolveDiffCommand(diffCommand)

  const proc = Bun.spawn(["sh", "-c", `gh pr diff ${pr.number} -R ${repo} --color=always | ${cmd}`], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  await proc.exited
}
