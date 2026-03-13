/**
 * Hook for building status bar hints
 */

import { useMemo } from "react"
import { isFilterActive, type ParsedFilter } from "../discovery"
import type { Config } from "../config"

interface UseStatusBarOptions {
  config: Config
  filter: ParsedFilter
  hiddenCount: number
  loading: boolean
  discoveryVisible: boolean
  previewMode: boolean
  prsCount: number
}

export function useStatusBar({
  config,
  filter,
  hiddenCount,
  loading,
  discoveryVisible,
  previewMode,
  prsCount,
}: UseStatusBarOptions): string[] {
  return useMemo(() => {
    const hints: string[] = []

    if (discoveryVisible) {
      hints.push("Tab: complete")
      hints.push("Enter/Esc: done")
      return hints
    }

    if (previewMode) {
      hints.push("p: close preview")
      hints.push("Ctrl-d/u: scroll")
      hints.push("j/k: navigate")
      hints.push(`${config.keys.quit}: quit`)
      return hints
    }

    if (loading) {
      hints.push("Loading...")
    } else if (prsCount > 0) {
      hints.push("/: filter")
      hints.push("j/k: navigate")
      hints.push("p: preview")
      hints.push("Enter: riff")
      hints.push("o: browser")
      hints.push("y: id")
      hints.push("Y: url")
      hints.push("s: star")
      if (hiddenCount > 0) {
        hints.push("*: show all")
      }
      if (isFilterActive(filter)) {
        hints.push("Esc: clear")
      }
    }

    hints.push(`${config.keys.quit}: quit`)

    return hints
  }, [config.keys.quit, filter, hiddenCount, loading, discoveryVisible, previewMode, prsCount])
}
