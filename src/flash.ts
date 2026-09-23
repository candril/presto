/**
 * Flash-style jump labels (spec 047), after lane's `utils/jump.ts` so the same row gets
 * the same key in both tools.
 */

// Home-row and near-home keys first; `s` is left out because it starts the jump
const FLASH_KEYS = "fjdklaghrueiwotynbvmcxzpq"

/**
 * Distinct labels for `count` targets, in assignment order. All share one length —
 * single keys when they fit, two-key combos otherwise — so no label is a prefix of
 * another and typing is never ambiguous. Two keys also fit the two-cell mark column.
 */
export function flashLabels(count: number): string[] {
  if (count <= 0) return []
  if (count <= FLASH_KEYS.length) return FLASH_KEYS.slice(0, count).split("")

  const out: string[] = []
  for (const a of FLASH_KEYS) {
    for (const b of FLASH_KEYS) {
      out.push(a + b)
      if (out.length === count) return out
    }
  }
  return out
}

export type FlashStep =
  | { type: "jump"; target: string }
  | { type: "narrow"; input: string }
  | { type: "cancel" }

/**
 * What a keypress does to an active jump: land on the label it completes, wait for the
 * second key of a two-key label, or cancel.
 */
export function resolveFlashKey(labels: Map<string, string>, input: string, key: string): FlashStep {
  if (key.length !== 1 || !/[a-z]/.test(key)) return { type: "cancel" }

  const next = input + key
  let prefix = false
  for (const [target, label] of labels) {
    if (label === next) return { type: "jump", target }
    if (label.startsWith(next)) prefix = true
  }
  return prefix ? { type: "narrow", input: next } : { type: "cancel" }
}
