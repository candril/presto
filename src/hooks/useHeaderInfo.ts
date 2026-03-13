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
    const hidden = hiddenCount > 0 ? ` +${hiddenCount}` : ""
    if (isFilterActive(filter)) {
      return `${filteredCount}/${totalCount}${hidden}`
    }
    if (hiddenCount > 0) {
      return `${filteredCount} (${hidden} hidden)`
    }
    return totalCount > 0 ? `${selectedIndex + 1}/${totalCount}` : ""
  }, [filter, filteredCount, totalCount, selectedIndex, hiddenCount])
}
