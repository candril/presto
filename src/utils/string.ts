/**
 * String utilities
 */

/** Truncate string to max length, appending "…" if truncated */
export function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len - 1) + "…"
}
