/**
 * Bot detection utilities
 * 
 * Filters out automated bot accounts from comment counts and displays.
 */

/**
 * Default patterns to identify bot accounts
 */
const DEFAULT_BOT_PATTERNS = [
  /\[bot\]$/i,           // GitHub apps: dependabot[bot], github-actions[bot]
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
  /-bot$/i,              // Generic bot suffix: dg-helix-bot, etc.
]

/** User-configured patterns (added via initBotPatterns) */
let userPatterns: RegExp[] = []

/**
 * Initialize bot patterns with user config
 * Call this once at startup with the loaded config
 */
export function initBotPatterns(patterns?: string[]): void {
  userPatterns = []
  
  if (patterns) {
    for (const pattern of patterns) {
      try {
        userPatterns.push(new RegExp(pattern, "i"))
      } catch {
        // Invalid regex, skip it
        console.error(`Invalid bot pattern: ${pattern}`)
      }
    }
  }
}

/**
 * Check if a username belongs to a bot account
 */
export function isBot(username: string): boolean {
  if (!username) return false
  // Always check default patterns first, then user patterns
  return DEFAULT_BOT_PATTERNS.some(pattern => pattern.test(username)) ||
         userPatterns.some(pattern => pattern.test(username))
}
