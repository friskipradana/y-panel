import { useEffect } from 'react'
import { useWindowStore } from '@/store/windowStore'
import { useAuthStore } from '@/store/authStore'
import { canAccessWindow } from '@/components/desktop/Desktop'
import type { WindowKind } from '@/types'

export function useGlobalShortcuts(authenticated: boolean) {
  useEffect(() => {
    if (!authenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping =
        ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) ||
        (e.target as HTMLElement).isContentEditable
      if (isTyping && e.key !== 'Escape') return

      const { openWindow, closeWindow, focusedId } = useWindowStore.getState()
      const userRole = useAuthStore.getState().user?.role ?? null
      const tryOpenWindow = (kind: WindowKind) => {
        if (!canAccessWindow(kind, userRole)) return
        openWindow(kind)
      }

      if (userRole && e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        tryOpenWindow('host-terminal')
      }
      if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        tryOpenWindow('file-manager')
      }
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        tryOpenWindow('settings')
      }
      if (e.altKey && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        tryOpenWindow('users')
      }
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        tryOpenWindow('projects')
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        tryOpenWindow('changelog')
      }
      if (e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (focusedId) closeWindow(focusedId)
      }
      if (e.key === 'Escape' && focusedId) {
        closeWindow(focusedId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [authenticated])
}
