/**
 * Preview hook with caching, debounce, and smart prefetching (spec 014)
 */

import { useEffect, useRef } from "react"
import { fetchPRPreview } from "../providers/github"
import type { PR, PRPreview, PreviewPosition } from "../types"
import type { AppAction } from "../state"

/** Debounce delay in ms */
const DEBOUNCE_MS = 150

/** Idle time before prefetching adjacent PRs */
const PREFETCH_IDLE_MS = 500

interface UsePreviewOptions {
  previewPosition: PreviewPosition
  previewCache: Map<string, PRPreview>
  dispatch: React.Dispatch<AppAction>
  selectedPR: PR | null
  /** All PRs for prefetching adjacent */
  allPRs: PR[]
  /** Current selected index for prefetching */
  selectedIndex: number
}

interface UsePreviewResult {
  preview: PRPreview | null
  loading: boolean
  cacheKey: string | null
}

/** Get cache key for a PR */
function getCacheKey(pr: PR): string {
  return `${getRepoFromPR(pr)}#${pr.number}`
}

/** Extract repo name from PR URL */
function getRepoFromPR(pr: PR): string {
  // URL format: https://github.com/owner/repo/pull/123
  const match = pr.url.match(/github\.com\/([^/]+\/[^/]+)\/pull/)
  return match?.[1] ?? ""
}

/**
 * Hook to manage PR preview loading with caching, debounce, and smart prefetching
 */
export function usePreview({
  previewPosition,
  previewCache,
  dispatch,
  selectedPR,
  allPRs,
  selectedIndex,
}: UsePreviewOptions): UsePreviewResult {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchingKeyRef = useRef<string | null>(null)
  const loadingKeyRef = useRef<string | null>(null)

  // Get current cache key
  const cacheKey = selectedPR ? getCacheKey(selectedPR) : null

  // Check if already cached
  const isCached = cacheKey ? previewCache.has(cacheKey) : false

  // Main fetch effect
  useEffect(() => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    // Only fetch if preview is on and we have a selected PR
    if (!previewPosition || !selectedPR || !cacheKey) {
      loadingKeyRef.current = null
      return
    }

    // If already cached, no need to fetch
    if (isCached) {
      loadingKeyRef.current = null
      return
    }

    // If already fetching this one, don't start another fetch
    if (fetchingKeyRef.current === cacheKey) {
      return
    }

    // Start loading
    loadingKeyRef.current = cacheKey

    // Debounce the fetch
    debounceRef.current = setTimeout(async () => {
      fetchingKeyRef.current = cacheKey
      dispatch({ type: "SET_PREVIEW_LOADING", key: cacheKey })

      try {
        const repo = getRepoFromPR(selectedPR)
        if (!repo) {
          dispatch({ type: "SET_PREVIEW_LOADING", key: null })
          fetchingKeyRef.current = null
          loadingKeyRef.current = null
          return
        }

        const preview = await fetchPRPreview(repo, selectedPR.number)

        // Only update if we're still interested in this key
        if (fetchingKeyRef.current === cacheKey) {
          dispatch({ type: "SET_PREVIEW_CACHE", key: cacheKey, data: preview })
          dispatch({ type: "SET_PREVIEW_LOADING", key: null })
          fetchingKeyRef.current = null
          loadingKeyRef.current = null
        }
      } catch (error) {
        if (fetchingKeyRef.current === cacheKey) {
          dispatch({ type: "SET_PREVIEW_LOADING", key: null })
          fetchingKeyRef.current = null
          loadingKeyRef.current = null
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [previewPosition, cacheKey, isCached, dispatch, selectedPR])

  // Smart prefetching effect - prefetch adjacent PRs after idle
  useEffect(() => {
    // Clear any pending prefetch
    if (prefetchRef.current) {
      clearTimeout(prefetchRef.current)
      prefetchRef.current = null
    }

    // Only prefetch if preview is on and current PR is cached
    if (!previewPosition || !isCached || allPRs.length === 0) {
      return
    }

    // Schedule prefetch after idle time
    prefetchRef.current = setTimeout(async () => {
      // Get adjacent PRs (prev 2 and next 2)
      const adjacentIndices = [
        selectedIndex - 2,
        selectedIndex - 1,
        selectedIndex + 1,
        selectedIndex + 2,
      ].filter(i => i >= 0 && i < allPRs.length)

      for (const idx of adjacentIndices) {
        const pr = allPRs[idx]
        if (!pr) continue

        const key = getCacheKey(pr)
        // Skip if already cached
        if (previewCache.has(key)) continue

        const repo = getRepoFromPR(pr)
        if (!repo) continue

        try {
          const preview = await fetchPRPreview(repo, pr.number)
          dispatch({ type: "SET_PREVIEW_CACHE", key, data: preview })
        } catch {
          // Silent fail for prefetch
        }
      }
    }, PREFETCH_IDLE_MS)

    return () => {
      if (prefetchRef.current) {
        clearTimeout(prefetchRef.current)
        prefetchRef.current = null
      }
    }
  }, [previewPosition, isCached, selectedIndex, allPRs, previewCache, dispatch])

  // Get current preview from cache
  const preview = cacheKey ? previewCache.get(cacheKey) ?? null : null
  const loading = loadingKeyRef.current === cacheKey && !preview

  return { preview, loading, cacheKey }
}
