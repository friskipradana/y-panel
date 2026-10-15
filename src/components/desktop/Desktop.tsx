import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Taskbar } from '@/components/taskbar/Taskbar'
import { MobileShell } from '@/components/mobile/MobileShell'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { Dock } from '@/components/dock/Dock'
import { WINDOW_CONTENT, WindowFallback, DESKTOP_SHORTCUTS, canAccessWindow } from '@/components/desktop/windowRegistry'
import { Window } from '@/components/desktop/Window'
import { WindowErrorBoundary } from '@/components/system/WindowErrorBoundary'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import type { WidgetType } from '@/types'
import { useI18n } from '@/lib/i18n'

import { DesktopWidgetLayer } from '@/components/widgets/DesktopWidgetLayer'
import { WIDGET_TOP, useWidgetStore } from '@/store/widgetStore'
import { LockScreen } from '@/components/desktop/LockScreen'
import { CommandPalette } from '@/components/common/CommandPalette'
import { DesktopIcon } from '@/components/desktop/DesktopIcon'

export { canAccessWindow }

interface DesktopProps {
  onLogout: () => void
  authenticated: boolean
}

export function Desktop({ onLogout, authenticated }: DesktopProps) {
  const { t } = useI18n()
  const { windows } = useWindowStore()
  const {
    getBackgroundStyle,
    mode,
    wallpaper,
    wallpaperFit,
    syncCustomImage,
    customImageUrl,
    wallpaperLoading,
    isLocked,
    setIsLocked,
    autoLockTimeout,
    lockScreenEnabled,
  } = useThemeStore()
  const rootRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobileLayout()
  const user = useAuthStore((s) => s.user)
  const userRole = user?.role ?? null
  const visibleWindows = useMemo(
    () => windows.filter((win) => canAccessWindow(win.kind, userRole)),
    [userRole, windows],
  )
  const desktopShortcuts = useMemo(
    () => DESKTOP_SHORTCUTS.filter((s) => canAccessWindow(s.windowId, userRole)),
    [userRole],
  )

  useEffect(() => {
    if (!authenticated) return
    void syncCustomImage()
  }, [authenticated, syncCustomImage])

  // Keep windows reachable when the viewport changes
  useEffect(() => {
    const clamp = () => useWindowStore.getState().clampWindowsToViewport()
    clamp()
    let timer: number | undefined
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(clamp, 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Auto-lock idle timer
  useEffect(() => {
    if (!authenticated || !lockScreenEnabled || !autoLockTimeout || autoLockTimeout <= 0 || isLocked) return

    let timer: number
    const resetTimer = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        setIsLocked(true)
      }, autoLockTimeout * 60 * 1000)
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      window.clearTimeout(timer)
      events.forEach((ev) => window.removeEventListener(ev, resetTimer))
    }
  }, [authenticated, autoLockTimeout, isLocked, setIsLocked])

  const backgroundStyle = useMemo(() => getBackgroundStyle(), [getBackgroundStyle, mode, wallpaper, wallpaperFit, customImageUrl])

  // Ghost showing where a widget dragged from the gallery will land
  const [dropGhost, setDropGhost] = useState<{ x: number; y: number } | null>(null)

  const dropPosition = (clientX: number, clientY: number) => {
    const minSafeX = window.innerWidth >= 640 ? 200 : 16
    return {
      x: Math.max(minSafeX, Math.min(window.innerWidth - 292, clientX - 140)),
      y: Math.max(WIDGET_TOP, Math.min(window.innerHeight - 120, clientY - 30)),
    }
  }

  const handleDesktopDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-reneo-widget') || e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropGhost(dropPosition(e.clientX, e.clientY))
    }
  }

  const handleDesktopDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only when the pointer leaves the desktop itself, not when it crosses child elements
    if (e.currentTarget === e.target) setDropGhost(null)
  }

  const handleDesktopDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const rawType = e.dataTransfer.getData('application/x-reneo-widget') || e.dataTransfer.getData('text/plain')
    if (rawType && ['clock-uptime', 'system-vital', 'network-traffic', 'quick-note', 'cpu-graph', 'ping'].includes(rawType)) {
      e.preventDefault()
      const drop = dropPosition(e.clientX, e.clientY)
      useWidgetStore.getState().addWidget(rawType as WidgetType, drop)
    }
    setDropGhost(null)
  }

  return (
    <div
      ref={rootRef}
      className="desktop-root"
      style={backgroundStyle}
      onDragOver={handleDesktopDragOver}
      onDragLeave={handleDesktopDragLeave}
      onDrop={handleDesktopDrop}
    >
      {dropGhost ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-[11] rounded-xl border-2 border-dashed"
          style={{
            left: dropGhost.x,
            top: dropGhost.y,
            width: 280,
            height: 120,
            borderColor: 'var(--win-border-focus)',
            background: 'var(--panel-primary-bg)',
          }}
        />
      ) : null}
      {isMobile ? null : <Taskbar onLogout={onLogout} authenticated={authenticated} />}

      {isMobile ? (
        <MobileShell authenticated={authenticated} onLogout={onLogout} />
      ) : (
        <>
        {/* Desktop App Shortcuts (Left Grid) */}
        <div className="absolute top-14 bottom-6 left-4 z-[10] flex flex-col flex-wrap content-start gap-2 pointer-events-auto select-none">
          {desktopShortcuts.map((app) => (
            <DesktopIcon key={app.id} app={app} />
          ))}
        </div>

        {/* Desktop Widgets (Above wallpaper, behind active windows) */}
        <DesktopWidgetLayer />

        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {visibleWindows.map((win) => {
              const renderContent = WINDOW_CONTENT[win.kind]
              return (
                <Window key={win.id} win={win}>
                  <WindowErrorBoundary>
                    <Suspense fallback={<WindowFallback />}>
                      {renderContent ? (
                        renderContent(win, authenticated)
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--sand-400)' }}>
                          {t('common.noContent')}
                        </p>
                      )}
                    </Suspense>
                  </WindowErrorBoundary>
                </Window>
              )
            })}
          </AnimatePresence>
        </div>
        <Dock />
        </>
      )}
      {authenticated && wallpaperLoading ? (
        <div className="pointer-events-none absolute inset-0 z-[1200] flex items-center justify-center bg-[var(--app-wallpaper-overlay-bg)] backdrop-blur-md">
          <div className="flex items-center gap-3 rounded-full border border-[var(--app-wallpaper-loader-border)] bg-[var(--app-wallpaper-loader-bg)] px-5 py-3 text-sm font-medium text-[var(--app-wallpaper-loader-text)] shadow-[var(--app-wallpaper-loader-shadow)]">
            <Loader2 size={16} className="animate-spin text-[var(--app-wallpaper-spinner)]" />
            <span>{t('app.preparingWallpaper')}</span>
          </div>
        </div>
      ) : null}

      {/* Lock Screen Overlay */}
      <AnimatePresence>
        {isLocked && <LockScreen onLogout={onLogout} />}
      </AnimatePresence>

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette />
    </div>
  )
}
