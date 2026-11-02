import { useLayoutEffect, useRef, type Dispatch } from "react"
import type { AppAction } from "../state"
import type { PR } from "../types"

export interface SelectionAnchor {
  url: string | null
  index: number
  /** Tab and query: a change in either is the user's doing, and is not followed */
  context: string
}

/**
 * The row the selected PR moved to, or null when the cursor should stay. Only a list that
 * changed under an untouched cursor is followed; a PR that left the list keeps the index.
 */
export function relocateSelection(
  anchor: SelectionAnchor | null,
  prs: PR[],
  selectedIndex: number,
  context: string
): number | null {
  if (!anchor?.url || anchor.context !== context || anchor.index !== selectedIndex) return null
  if (prs[selectedIndex]?.url === anchor.url) return null
  const moved = prs.findIndex((pr) => pr.url === anchor.url)
  return moved >= 0 ? moved : null
}

/** Keeps the cursor on its PR when a refresh re-sorts the list (spec 055) */
export function useStickySelection(
  prs: PR[],
  selectedIndex: number,
  context: string,
  dispatch: Dispatch<AppAction>
): void {
  const anchor = useRef<SelectionAnchor | null>(null)

  // Layout effect: the corrected selection lands before the frame with the wrong row is painted
  useLayoutEffect(() => {
    const moved = relocateSelection(anchor.current, prs, selectedIndex, context)
    if (moved !== null) {
      anchor.current = { url: anchor.current!.url, index: moved, context }
      dispatch({ type: "SELECT", index: moved })
      return
    }
    anchor.current = { url: prs[selectedIndex]?.url ?? null, index: selectedIndex, context }
  }, [prs, selectedIndex, context, dispatch])
}
