/**
 * Bot detection utilities
 * 
 * Filters out automated bot accounts from comment counts and displays.
 */

/**
 * Patterns to identify bot accounts
 */
const BOT_PATTERNS = [
  /\[bot\]$/i,           // GitHub apps: dependabot[bot], github-actions[bot], dg-pull-request-notifier[bot]
  /^dependabot$/i,       // Legacy dependabot
  /^renovate$/i,         // Renovate bot
  /^github-actions$/i,   // GitHub Actions (legacy)
  /^codecov$/i,          // Codecov
  /^sonarcloud$/i,       // SonarCloud
  /^vercel$/i,           // Vercel
  /^netlify$/i,          // Netlify
  /^semantic-release$/i, // Semantic release
  /-reviewers$/i,        // Auto-reviewer bots: dg-dynamic-reviewers
  /-notifier$/i,         // Notifier bots
]

/**
 * Check if a username belongs to a bot account
 */
export function isBot(username: string): boolean {
  if (!username) return false
  return BOT_PATTERNS.some(pattern => pattern.test(username))
}
