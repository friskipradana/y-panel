import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
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

const WindowPollingContext = createContext<boolean | undefined>(undefined)

export function WindowPollingProvider({
  win,
  forceActive,
  children,
}: {
  win?: WindowState
  forceActive?: boolean
  children: ReactNode
}) {
  const focusedId = useWindowStore(selectFocusedId)
  const pageVisible = useSyncExternalStore(subscribeVisibility, getPageVisible, () => true)
  const active = useMemo(() => {
    if (!pageVisible) return false
    if (forceActive !== undefined) return forceActive
    if (!win) return true
    return win.id === focusedId && !win.isMinimized
  }, [focusedId, forceActive, pageVisible, win])

  return createElement(WindowPollingContext.Provider, { value: active }, children)
}

export function useWindowPollingActive(win?: WindowState, fallback = true) {
  const focusedId = useWindowStore(selectFocusedId)
  const pageVisible = useSyncExternalStore(subscribeVisibility, getPageVisible, () => true)
  const contextActive = useContext(WindowPollingContext)

  return useMemo(() => {
    if (!pageVisible) return false
    if (win) return win.id === focusedId && !win.isMinimized
    if (contextActive !== undefined) return contextActive
    return fallback
  }, [contextActive, fallback, focusedId, pageVisible, win])
}
