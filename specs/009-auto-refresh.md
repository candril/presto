# Auto-Refresh

**Status**: Draft

## Description

Automatically refresh pull request data at configurable intervals. Support manual refresh, visual refresh indicators, and smart refresh on terminal focus.

## Out of Scope

- WebSocket/real-time updates (polling only)
- Push notifications
- Background process when app is closed

## Capabilities

### P1 - Must Have

- **Manual refresh**: `R` key to refresh immediately
- **Refresh indicator**: Show when data is refreshing
- **Last updated**: Display when data was last fetched
- **Error recovery**: Retry on failure with backoff

### P2 - Should Have

- **Auto-refresh interval**: Configurable timer (default 5 min)
- **Focus refresh**: Refresh when terminal gains focus
- **Pause on detail**: Don't refresh while viewing detail
- **Stale indicator**: Visual cue when data is old

### P3 - Nice to Have

- **Smart refresh**: Shorter interval during working hours
- **Per-repo refresh**: Different intervals per repo
- **Background fetch**: Prefetch before interval expires

## Technical Notes

### Refresh Hook

```typescript
// src/hooks/useAutoRefresh.ts
import { useEffect, useRef, useCallback, useState } from "react"
import type { Config } from "../config/schema"

interface UseAutoRefreshOptions {
  interval: number          // Seconds, 0 to disable
  onRefresh: () => Promise<void>
  enabled: boolean
  pauseWhenDetailOpen: boolean
}

interface RefreshState {
  lastRefresh: Date | null
  isRefreshing: boolean
  error: string | null
  nextRefresh: Date | null
}

export function useAutoRefresh(options: UseAutoRefreshOptions) {
  const { interval, onRefresh, enabled, pauseWhenDetailOpen } = options
  const [state, setState] = useState<RefreshState>({
    lastRefresh: null,
    isRefreshing: false,
    error: null,
    nextRefresh: null,
  })
  
  const timeoutRef = useRef<Timer | null>(null)
  const retryCountRef = useRef(0)
  
  const refresh = useCallback(async () => {
    setState(s => ({ ...s, isRefreshing: true, error: null }))
    
    try {
      await onRefresh()
      setState(s => ({
        ...s,
        isRefreshing: false,
        lastRefresh: new Date(),
        nextRefresh: interval > 0 ? new Date(Date.now() + interval * 1000) : null,
      }))
      retryCountRef.current = 0
    } catch (err) {
      const error = err instanceof Error ? err.message : "Refresh failed"
      setState(s => ({ ...s, isRefreshing: false, error }))
      
      // Exponential backoff on error
      retryCountRef.current++
      const backoff = Math.min(60, Math.pow(2, retryCountRef.current)) * 1000
      scheduleRefresh(backoff)
    }
  }, [onRefresh, interval])
  
  const scheduleRefresh = useCallback((ms: number) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(refresh, ms)
    setState(s => ({ ...s, nextRefresh: new Date(Date.now() + ms) }))
  }, [refresh])
  
  // Set up interval
  useEffect(() => {
    if (!enabled || interval <= 0) return
    
    scheduleRefresh(interval * 1000)
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [enabled, interval, scheduleRefresh])
  
  return {
    ...state,
    refresh,        // Manual refresh
    isStale: state.lastRefresh && 
      Date.now() - state.lastRefresh.getTime() > interval * 2 * 1000,
  }
}
```

### Focus Detection

```typescript
// src/hooks/useFocusRefresh.ts
import { useEffect } from "react"

export function useFocusRefresh(onFocus: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    
    // Terminal focus detection via SIGCONT (when resumed from background)
    const handleResume = () => {
      onFocus()
    }
    
    process.on("SIGCONT", handleResume)
    
    return () => {
      process.off("SIGCONT", handleResume)
    }
  }, [onFocus, enabled])
}
```

### Refresh Indicator Component

```tsx
// src/components/RefreshIndicator.tsx
import { theme } from "../theme"

interface RefreshIndicatorProps {
  isRefreshing: boolean
  lastRefresh: Date | null
  isStale: boolean
  error: string | null
}

export function RefreshIndicator({ 
  isRefreshing, 
  lastRefresh, 
  isStale,
  error 
}: RefreshIndicatorProps) {
  if (isRefreshing) {
    return (
      <text fg={theme.primary}>
        <Spinner /> Refreshing...
      </text>
    )
  }
  
  if (error) {
    return (
      <text fg={theme.error}>
        Refresh failed: {error}
      </text>
    )
  }
  
  if (!lastRefresh) {
    return <text fg={theme.textDim}>Never refreshed</text>
  }
  
  const timeAgo = formatRelativeTime(lastRefresh)
  const color = isStale ? theme.warning : theme.textDim
  
  return (
    <text fg={color}>
      Updated {timeAgo}
      {isStale && " (stale)"}
    </text>
  )
}

function Spinner() {
  // Simple spinner using Unicode
  const frames = ["◐", "◓", "◑", "◒"]
  const [frame, setFrame] = useState(0)
  
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length)
    }, 100)
    return () => clearInterval(timer)
  }, [])
  
  return <span>{frames[frame]}</span>
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
```

### Integration with App

```tsx
// In App.tsx
function App({ config }: { config: Config }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  
  const fetchPRs = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true })
    try {
      const prs = await listPRsFromRepos(config.repositories)
      dispatch({ type: "SET_PRS", prs })
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: String(err) })
      throw err
    }
  }, [config.repositories])
  
  const { 
    isRefreshing, 
    lastRefresh, 
    isStale, 
    error,
    refresh 
  } = useAutoRefresh({
    interval: config.refresh.interval,
    onRefresh: fetchPRs,
    enabled: true,
    pauseWhenDetailOpen: state.viewMode === "detail",
  })
  
  useFocusRefresh(refresh, config.refresh.on_focus)
  
  // Initial fetch
  useEffect(() => {
    fetchPRs()
  }, [fetchPRs])
  
  // Manual refresh on R
  useKeyboard((key) => {
    if (key.name === "R") {
      refresh()
    }
  })
  
  return (
    <Shell>
      <Header title="presto">
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastRefresh={lastRefresh}
          isStale={isStale}
          error={error}
        />
      </Header>
      {/* ... */}
    </Shell>
  )
}
```

### State Updates

```typescript
// src/state.ts
export interface AppState {
  // ... existing
  isRefreshing: boolean
  lastRefresh: Date | null
  refreshError: string | null
}

export type AppAction =
  // ... existing
  | { type: "SET_REFRESHING"; refreshing: boolean }
  | { type: "SET_LAST_REFRESH"; time: Date }
  | { type: "SET_REFRESH_ERROR"; error: string | null }
```

## File Structure

```
src/
├── hooks/
│   ├── useAutoRefresh.ts      # Auto-refresh logic
│   └── useFocusRefresh.ts     # Focus detection
├── components/
│   └── RefreshIndicator.tsx   # Refresh status display
└── App.tsx                    # Integration
```
