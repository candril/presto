/**
 * Hook for auto-refresh functionality
 * Handles interval-based refresh and focus refresh. The refresh stamps its own time:
 * only it knows whether it succeeded.
 */

import { useEffect, useRef, useCallback } from "react"
import type { FocusCallback } from "../utils/focus-reporting"

interface UseAutoRefreshOptions {
  /** Refresh interval in seconds (0 to disable) */
  interval: number
  /** Refresh when terminal gains focus */
  onFocus: boolean
  /** Function to call on refresh */
  onRefresh: () => Promise<void>
  /** Last refresh timestamp */
  lastRefresh: Date | null
  /** Register for terminal focus events (tmux/window switches) */
  registerFocusCallback?: (cb: FocusCallback) => () => void
}

export function useAutoRefresh({
  interval,
  onFocus,
  onRefresh,
  lastRefresh,
  registerFocusCallback,
}: UseAutoRefreshOptions): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRefreshingRef = useRef(false)
  const lastRefreshRef = useRef(lastRefresh)
  // Terminals without focus reporting never send an event, so the only safe
  // starting assumption is that someone is looking at us.
  const isFocusedRef = useRef(true)
  
  // Keep lastRefreshRef in sync
  useEffect(() => {
    lastRefreshRef.current = lastRefresh
  }, [lastRefresh])

  // Callers pass fresh closures on every render. Depending on them would re-run the
  // interval effect each time, and every keypress would push the next refresh back by a
  // whole interval — while someone is using presto, it would never fire.
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const doRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    
    try {
      await onRefreshRef.current()
    } finally {
      isRefreshingRef.current = false
    }
  }, [])

  // Set up interval-based refresh
  useEffect(() => {
    if (interval <= 0) return

    const scheduleNext = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        // Nobody is reading an unfocused presto, and the GitHub bill arrives
        // either way: a window left open in a detached terminal drained the
        // whole hourly GraphQL budget on its own. Focus-in catches up.
        if (onFocus && !isFocusedRef.current) {
          scheduleNext()
          return
        }
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
  }, [interval, doRefresh, onFocus])

  // Set up focus-based refresh via terminal focus reporting (tmux/window switches)
  useEffect(() => {
    if (!onFocus || !registerFocusCallback) return

    const handleFocus = (focused: boolean) => {
      isFocusedRef.current = focused
      if (!focused) return // Only refresh on focus IN
      
      // Only refresh if data is potentially stale (> 30 seconds since last refresh)
      const staleThreshold = 30 * 1000 // 30 seconds
      const lr = lastRefreshRef.current
      if (!lr || Date.now() - lr.getTime() > staleThreshold) {
        doRefresh()
      }
    }

    return registerFocusCallback(handleFocus)
  }, [onFocus, registerFocusCallback, doRefresh])

  // Also listen for SIGCONT (process resume from Ctrl+Z)
  useEffect(() => {
    if (!onFocus) return

    const handleResume = () => {
      // Only refresh if data is potentially stale (> 30 seconds since last refresh)
      const staleThreshold = 30 * 1000 // 30 seconds
      const lr = lastRefreshRef.current
      if (!lr || Date.now() - lr.getTime() > staleThreshold) {
        doRefresh()
      }
    }

    process.on("SIGCONT", handleResume)

    return () => {
      process.off("SIGCONT", handleResume)
    }
  }, [onFocus, doRefresh])
}
