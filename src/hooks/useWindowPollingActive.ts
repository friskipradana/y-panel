import { useMemo } from 'react'
import { selectFocusedId, useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'

export function useWindowPollingActive(win?: WindowState, fallback = true) {
  const focusedId = useWindowStore(selectFocusedId)
  return useMemo(() => {
    if (!win) return fallback
    return win.id === focusedId && !win.isMinimized
  }, [fallback, focusedId, win])
}
