/**
 * Simple request logger for network calls.
 * Logs are captured by OpenTUI's console (toggle with ` key).
 */

/** Format milliseconds into a human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Log an outgoing API request */
export function logRequest(method: string, label: string): { finish: (detail?: string) => void; fail: (error?: unknown) => void } {
  const start = performance.now()
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false })
  console.log(`[${ts}]  → ${method} ${label}`)

  return {
    finish(detail?: string) {
      const elapsed = performance.now() - start
      const suffix = detail ? ` (${detail})` : ""
      console.log(`[${ts}]  ← ${method} ${label} ${formatDuration(elapsed)}${suffix}`)
    },
    fail(error?: unknown) {
      const elapsed = performance.now() - start
      const msg = error instanceof Error ? error.message : String(error ?? "unknown error")
      console.error(`[${ts}]  ✗ ${method} ${label} ${formatDuration(elapsed)} — ${msg}`)
    },
  }
}
