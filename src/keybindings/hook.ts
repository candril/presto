/**
 * Keybindings hook
 * 
 * Provides access to keybindings with user customization merged in.
 */

import { useMemo, useCallback } from "react"
import type { KeyAction, KeyEvent } from "./types"
import { defaultBindings } from "./defaults"
import { parseKeyCombo, matchesKey, formatKeyDisplay } from "./parser"
import type { Config } from "../config"

export interface KeybindingsContext {
  /** Check if a key event matches an action */
  matches: (event: KeyEvent, action: KeyAction) => boolean
  /** Get the display string for an action's keybinding */
  getKeyDisplay: (action: KeyAction) => string
  /** Get the raw binding string for an action */
  getBinding: (action: KeyAction) => string
  /** All resolved bindings */
  bindings: Record<KeyAction, string>
}

/**
 * Create keybindings context from config
 * 
 * This is a non-hook version for use outside of React components.
 */
export function createKeybindings(config: Config): KeybindingsContext {
  // Merge defaults with user config
  const bindings = { ...defaultBindings } as Record<KeyAction, string>
  
  // Apply user overrides from config.keys
  if (config.keys) {
    for (const [action, binding] of Object.entries(config.keys)) {
      if (action in defaultBindings) {
        bindings[action as KeyAction] = binding
      }
    }
  }

  const matches = (event: KeyEvent, action: KeyAction): boolean => {
    const binding = bindings[action]
    if (!binding) return false // Unbound
    const combo = parseKeyCombo(binding)
    return matchesKey(event, combo)
  }

  const getKeyDisplay = (action: KeyAction): string => {
    const binding = bindings[action]
    if (!binding) return ""
    return formatKeyDisplay(binding)
  }

  const getBinding = (action: KeyAction): string => {
    return bindings[action] ?? ""
  }

  return { matches, getKeyDisplay, getBinding, bindings }
}

/**
 * Hook to access keybindings in React components
 */
export function useKeybindings(config: Config): KeybindingsContext {
  return useMemo(() => createKeybindings(config), [config])
}
