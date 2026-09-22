/**
 * Age fade: a row's text dims as its last update recedes.
 *
 * Terminals have no alpha over text, so "less opaque" is a blend of the foreground
 * towards the background it sits on. The steps are deliberate rather than a smooth
 * ramp — a gradient makes every row slightly different and none of them readable as a
 * value, while two steps can be learned: normal, a while ago, old.
 */

import { theme } from "./theme"

export interface FadeSettings {
  /** Days before a row starts fading. 0 disables the fade entirely. */
  afterDays: number
  /** How much of the colour survives at the oldest step, 0-1. */
  floor: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How much of a row's colour survives, from 1 (untouched) down to `floor`.
 *
 * The middle step sits halfway, so crossing the threshold is visible without the row
 * dropping straight to the floor.
 */
export function fadeLevel(
  updatedAt: string | null | undefined,
  settings: FadeSettings,
  now: number = Date.now(),
): number {
  if (settings.afterDays <= 0) return 1

  const updated = updatedAt ? Date.parse(updatedAt) : NaN
  // An unparseable or future timestamp is not evidence of age; leave the row alone.
  if (Number.isNaN(updated)) return 1

  const ageDays = (now - updated) / DAY_MS
  if (ageDays < settings.afterDays) return 1
  if (ageDays < settings.afterDays * 2) return (1 + settings.floor) / 2
  return settings.floor
}

/** Blend `color` towards `background`; level 1 returns it unchanged. */
export function fade(color: string, level: number, background: string = theme.bg): string {
  if (level >= 1) return color

  const fg = parseHex(color)
  const bg = parseHex(background)
  if (!fg || !bg) return color

  const clamped = Math.max(0, Math.min(1, level))
  const channel = (a: number, b: number) => Math.round(b + (a - b) * clamped)
  return toHex(channel(fg[0], bg[0]), channel(fg[1], bg[1]), channel(fg[2], bg[2]))
}

/** `#rgb` and `#rrggbb`; an alpha suffix is ignored, since the blend replaces it. */
function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "")
  // A named colour is not a hex triple: slicing one yields NaN channels, which render
  // as a broken colour instead of the one that was asked for.
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null
  if (hex.length === 3) {
    const [r, g, b] = [...hex].map((c) => parseInt(c + c, 16))
    return [r!, g!, b!]
  }
  if (hex.length >= 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }
  return null
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`
}
