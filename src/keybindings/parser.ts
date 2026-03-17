/**
 * Keybinding string parser
 * 
 * Parses strings like "ctrl+p", "G", "escape" into KeyCombo objects
 * and matches keyboard events against them.
 */

import type { KeyCombo, KeyEvent } from "./types"

/**
 * Parse a keybinding string into a KeyCombo
 * 
 * Examples:
 *   "q" -> { key: "q" }
 *   "G" -> { key: "g", shift: true }
 *   "ctrl+p" -> { key: "p", ctrl: true }
 *   "ctrl+shift+d" -> { key: "d", ctrl: true, shift: true }
 */
export function parseKeyCombo(str: string): KeyCombo {
  if (!str) {
    return { key: "" }
  }

  const parts = str.toLowerCase().split("+")
  const combo: KeyCombo = { key: "" }

  for (const part of parts) {
    if (part === "ctrl") {
      combo.ctrl = true
    } else if (part === "shift") {
      combo.shift = true
    } else {
      // The actual key - could be single char or name like "return", "escape"
      combo.key = part
    }
  }

  // Handle uppercase letter as shift+letter
  // "G" in the original string means shift+g
  if (str.length === 1 && str >= "A" && str <= "Z") {
    combo.key = str.toLowerCase()
    combo.shift = true
  }

  return combo
}

/**
 * Check if a keyboard event matches a KeyCombo
 */
export function matchesKey(event: KeyEvent, combo: KeyCombo): boolean {
  // Empty/unbound key never matches
  if (!combo.key) return false

  // Check modifiers
  const wantCtrl = combo.ctrl ?? false
  const wantShift = combo.shift ?? false
  const hasCtrl = event.ctrl ?? false
  const hasShift = event.shift ?? false

  if (wantCtrl !== hasCtrl) return false
  if (wantShift !== hasShift) return false

  // Check key name
  // Handle special cases for key names
  const eventKey = event.name?.toLowerCase() ?? ""
  const comboKey = combo.key.toLowerCase()

  // Direct match
  if (eventKey === comboKey) return true

  // Handle "return" vs "enter"
  if (comboKey === "return" && eventKey === "enter") return true
  if (comboKey === "enter" && eventKey === "return") return true

  return false
}

/**
 * Format a keybinding for display in the UI
 * 
 * Examples:
 *   "ctrl+p" -> "Ctrl+P"
 *   "G" -> "Shift+G"
 *   "escape" -> "Esc"
 */
export function formatKeyDisplay(str: string): string {
  if (!str) return ""

  const combo = parseKeyCombo(str)
  const parts: string[] = []

  if (combo.ctrl) parts.push("Ctrl")
  if (combo.shift) parts.push("Shift")

  // Format the key name nicely
  let keyDisplay = combo.key
  switch (combo.key) {
    case "return":
    case "enter":
      keyDisplay = "Enter"
      break
    case "escape":
      keyDisplay = "Esc"
      break
    case "space":
      keyDisplay = "Space"
      break
    case "backspace":
      keyDisplay = "Backspace"
      break
    case "tab":
      keyDisplay = "Tab"
      break
    case "up":
      keyDisplay = "Up"
      break
    case "down":
      keyDisplay = "Down"
      break
    case "left":
      keyDisplay = "Left"
      break
    case "right":
      keyDisplay = "Right"
      break
    default:
      // Single letter - uppercase it
      if (keyDisplay.length === 1) {
        keyDisplay = keyDisplay.toUpperCase()
      }
  }

  parts.push(keyDisplay)
  return parts.join("+")
}
