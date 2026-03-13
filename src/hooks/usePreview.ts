/**
 * Preview hook with caching and debounce (spec 014)
 */

import { useEffect, useRef } from "react"
import { fetchPRPreview } from "../providers/github"
import type { PR, PRPreview } from "../types"
import type { AppAction } from "../state"

/** Debounce delay in ms */
const DEBOUNCE_MS = 150

interface UsePreviewOptions {
  previewMode: boolean
  previewCache: Map<string, PRPreview>
  dispatch: React.Dispatch<AppAction>
  selectedPR: PR | null
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
 * Hook to manage PR preview loading with caching and debounce
 */
export function usePreview({
  previewMode,
  previewCache,
  dispatch,
  selectedPR,
}: UsePreviewOptions): UsePreviewResult {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchingKeyRef = useRef<string | null>(null)
  const loadingKeyRef = useRef<string | null>(null)

  // Get current cache key
  const cacheKey = selectedPR ? getCacheKey(selectedPR) : null

  // Check if already cached
  const isCached = cacheKey ? previewCache.has(cacheKey) : false

  useEffect(() => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    // Only fetch if preview mode is on and we have a selected PR
    if (!previewMode || !selectedPR || !cacheKey) {
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
  }, [previewMode, cacheKey, isCached, dispatch, selectedPR])

  // Get current preview from cache
  const preview = cacheKey ? previewCache.get(cacheKey) ?? null : null
  const loading = loadingKeyRef.current === cacheKey && !preview

  return { preview, loading, cacheKey }
}
