import { useEffect } from 'react'
import { useWindowStore } from '@/store/windowStore'
import { useAuthStore } from '@/store/authStore'
import { useCommandStore } from '@/store/commandStore'
import { canAccessWindow } from '@/components/desktop/windowRegistry'
import { useThemeStore } from '@/store/themeStore'
import type { WindowKind } from '@/types'

// Alt + letter opens an app; the quick search shows the same keys next to the apps
export const WINDOW_SHORTCUTS: Array<{ key: string; kind: WindowKind }> = [
  { key: 't', kind: 'host-terminal' },
  { key: 'f', kind: 'file-manager' },
  { key: 's', kind: 'settings' },
  { key: 'u', kind: 'users' },
  { key: 'p', kind: 'projects' },
  { key: 'n', kind: 'changelog' },
]

export function shortcutHint(kind: WindowKind): string | undefined {
  const found = WINDOW_SHORTCUTS.find((item) => item.kind === kind)
  return found ? `Alt + ${found.key.toUpperCase()}` : undefined
}

export function useGlobalShortcuts(authenticated: boolean) {
  useEffect(() => {
    if (!authenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Terminals and the code editor own their keys: Esc, Ctrl+K, Alt+letter belong to the program
      // running inside them. Only Ctrl+Shift+K still reaches the command palette from there.
      const target = e.target as HTMLElement
      const ownsKeys = !!target.closest?.('.xterm, .monaco-editor')
      if (ownsKeys && !((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k')) return

      // Toggle Command Palette (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useCommandStore.getState().toggleCommandPalette()
        return
      }

      // Ctrl+Shift+2 / 3 / 4: large, medium, small icons (the View menu of the taskbar)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        const size = { Digit2: 'large', Digit3: 'medium', Digit4: 'small' }[e.code] as 'large' | 'medium' | 'small' | undefined
        if (size) {
          e.preventDefault()
          useThemeStore.getState().setDesktopIconSize(size)
          return
        }
      }

      const isTyping =
        ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
      if (isTyping && e.key !== 'Escape') return

      const { openWindow, closeWindow, focusedId } = useWindowStore.getState()
      const userRole = useAuthStore.getState().user?.role ?? null
      const tryOpenWindow = (kind: WindowKind) => {
        if (!canAccessWindow(kind, userRole)) return
        openWindow(kind)
      }

      if (e.altKey) {
        const shortcut = WINDOW_SHORTCUTS.find((item) => item.key === e.key.toLowerCase())
        if (shortcut) {
          e.preventDefault()
          tryOpenWindow(shortcut.kind)
        }
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
