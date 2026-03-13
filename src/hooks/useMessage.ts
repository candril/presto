/**
 * Hook for temporary message/toast handling
 */

import { useEffect } from "react"

interface UseMessageOptions {
  message: string | null
  dispatch: (action: any) => void
  timeout?: number
}

export function useMessage({ message, dispatch, timeout = 2000 }: UseMessageOptions) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        dispatch({ type: "CLEAR_MESSAGE" })
      }, timeout)
      return () => clearTimeout(timer)
    }
  }, [message, dispatch, timeout])
}
