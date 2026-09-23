/**
 * Flash-style jump state (spec 047): the labels on screen and the keys typed so far.
 */

import { useCallback, useState } from "react"
import { flashLabels, resolveFlashKey } from "../flash"

export interface FlashState {
  /** Label per PR URL — not per index, so a refresh landing mid-jump cannot redirect it */
  labels: Map<string, string>
  input: string
}

export function useFlash() {
  const [flash, setFlash] = useState<FlashState | null>(null)

  /** Label the given PR URLs, top to bottom. Nothing on screen, nothing to start. */
  const startFlash = useCallback((urls: string[]) => {
    if (urls.length === 0) return
    const codes = flashLabels(urls.length)
    setFlash({ labels: new Map(urls.map((url, i) => [url, codes[i]])), input: "" })
  }, [])

  /** Feed a key to the active jump; the URL it lands on, or null while waiting or cancelled. */
  const handleFlashKey = useCallback((key: string): string | null => {
    if (!flash) return null
    const step = resolveFlashKey(flash.labels, flash.input, key)
    if (step.type === "narrow") {
      setFlash({ ...flash, input: step.input })
      return null
    }
    setFlash(null)
    return step.type === "jump" ? step.target : null
  }, [flash])

  return { flash, startFlash, handleFlashKey }
}
