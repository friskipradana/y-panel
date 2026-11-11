import { useMemo, useSyncExternalStore } from 'react'
import { selectFocusedId, useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'

function subscribeVisibility(cb: () => void) {
  if (typeof document === 'undefined') return () => {}
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}

function getPageVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

export function useWindowPollingActive(win?: WindowState, fallback = true) {
  const focusedId = useWindowStore(selectFocusedId)
  const pageVisible = useSyncExternalStore(subscribeVisibility, getPageVisible, () => true)
  return useMemo(() => {
    if (!pageVisible) return false
    if (!win) return fallback
    return win.id === focusedId && !win.isMinimized
  }, [fallback, focusedId, pageVisible, win])
}
