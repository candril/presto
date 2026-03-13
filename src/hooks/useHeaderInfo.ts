/**
 * Hook for building header right-side info
 */

import { useMemo } from "react"
import { isFilterActive, type ParsedFilter } from "../discovery"

interface UseHeaderInfoOptions {
  filter: ParsedFilter
  filteredCount: number
  totalCount: number
  selectedIndex: number
  hiddenCount: number
}

export function useHeaderInfo({
  filter,
  filteredCount,
  totalCount,
  selectedIndex,
  hiddenCount,
}: UseHeaderInfoOptions): string {
  return useMemo(() => {
    // Only show info when filtering or when there are hidden PRs
    if (isFilterActive(filter)) {
      const hidden = hiddenCount > 0 ? ` +${hiddenCount}` : ""
      return `${filteredCount}/${totalCount}${hidden}`
    }
    if (hiddenCount > 0) {
      return `+${hiddenCount} hidden`
    }
    return ""
  }, [filter, filteredCount, totalCount, hiddenCount])
}
