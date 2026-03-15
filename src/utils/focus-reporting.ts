/**
 * Terminal focus reporting
 * 
 * Enables focus in/out detection for terminal window/pane switches.
 * Works with tmux, iTerm2, kitty, and most modern terminal emulators.
 * 
 * Uses DECSET mode 1004:
 * - Enable: \x1b[?1004h
 * - Disable: \x1b[?1004l
 * - Focus in: \x1b[I
 * - Focus out: \x1b[O
 */

import type { CliRenderer } from "@opentui/core"

export type FocusCallback = (focused: boolean) => void

// Focus reporting escape sequences
const ENABLE_FOCUS_REPORTING = "\x1b[?1004h"
const DISABLE_FOCUS_REPORTING = "\x1b[?1004l"
const FOCUS_IN_SEQUENCE = "\x1b[I"
const FOCUS_OUT_SEQUENCE = "\x1b[O"

/**
 * Set up terminal focus reporting.
 * Returns a cleanup function to disable focus reporting.
 */
export function setupFocusReporting(
  renderer: CliRenderer,
  onFocusChange: FocusCallback
): () => void {
  // Enable focus reporting
  process.stdout.write(ENABLE_FOCUS_REPORTING)

  // Handle focus sequences via input handler
  const handleInput = (sequence: string): boolean => {
    if (sequence === FOCUS_IN_SEQUENCE) {
      onFocusChange(true)
      return true // Consume the sequence
    }
    if (sequence === FOCUS_OUT_SEQUENCE) {
      onFocusChange(false)
      return true // Consume the sequence
    }
    return false // Let other handlers process it
  }

  // Prepend our handler so we see sequences first
  renderer.prependInputHandler(handleInput)

  // Return cleanup function
  return () => {
    renderer.removeInputHandler(handleInput)
    process.stdout.write(DISABLE_FOCUS_REPORTING)
  }
}
