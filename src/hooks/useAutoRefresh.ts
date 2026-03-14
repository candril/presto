/**
 * Hook for auto-refresh functionality
 * Handles interval-based refresh, focus refresh, and stale detection
 */

import { useEffect, useRef, useCallback } from "react"

interface UseAutoRefreshOptions {
  /** Refresh interval in seconds (0 to disable) */
  interval: number
  /** Refresh when terminal gains focus */
  onFocus: boolean
  /** Function to call on refresh */
  onRefresh: () => Promise<void>
  /** Last refresh timestamp */
  lastRefresh: Date | null
  /** Called when lastRefresh should be updated */
  onRefreshComplete: (time: Date) => void
}

interface AutoRefreshState {
  /** Data is stale (older than 2x interval) */
  isStale: boolean
  /** Time until next refresh in seconds */
  nextRefreshIn: number | null
}

export function useAutoRefresh({
  interval,
  onFocus,
  onRefresh,
  lastRefresh,
  onRefreshComplete,
}: UseAutoRefreshOptions): AutoRefreshState {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRefreshingRef = useRef(false)

  // Perform refresh and update timestamp
  const doRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    
    try {
      await onRefresh()
      onRefreshComplete(new Date())
    } finally {
      isRefreshingRef.current = false
    }
  }, [onRefresh, onRefreshComplete])

  // Set up interval-based refresh
  useEffect(() => {
    if (interval <= 0) return

    const scheduleNext = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        doRefresh().then(scheduleNext)
      }, interval * 1000)
    }

    // Start the interval
    scheduleNext()

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [interval, doRefresh])

  // Set up focus-based refresh (SIGCONT signal when terminal is resumed)
  useEffect(() => {
    if (!onFocus) return

    const handleResume = () => {
      // Only refresh if data is potentially stale (> 30 seconds since last refresh)
      const staleThreshold = 30 * 1000 // 30 seconds
      if (!lastRefresh || Date.now() - lastRefresh.getTime() > staleThreshold) {
        doRefresh()
      }
    }

    process.on("SIGCONT", handleResume)

    return () => {
      process.off("SIGCONT", handleResume)
    }
  }, [onFocus, lastRefresh, doRefresh])

  // Calculate stale state and next refresh time
  const isStale = lastRefresh && interval > 0
    ? Date.now() - lastRefresh.getTime() > interval * 2 * 1000
    : false

  const nextRefreshIn = lastRefresh && interval > 0
    ? Math.max(0, Math.ceil((lastRefresh.getTime() + interval * 1000 - Date.now()) / 1000))
    : null

  return {
    isStale,
    nextRefreshIn,
  }
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
