import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Taskbar } from '@/components/taskbar/Taskbar'
import { Dock } from '@/components/dock/Dock'
import { Window } from '@/components/desktop/Window'
import { WindowErrorBoundary } from '@/components/system/WindowErrorBoundary'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import { lazyNamed, lazyDefault } from '@/lib/lazy'
import type { WindowKind, WindowState } from '@/types'
import { useI18n } from '@/lib/i18n'

// Code-split window components with clean 1-line syntax & preloading support
const DockerWindow = lazyNamed(() => import('@/components/windows/DockerWindow'), 'DockerWindow')
const SystemWindow = lazyNamed(() => import('@/components/windows/SystemWindow'), 'SystemWindow')
const SettingsWindow = lazyNamed(() => import('@/components/windows/SettingsWindow'), 'SettingsWindow')
const DatabaseWindow = lazyNamed(() => import('@/components/windows/DatabaseWindow'), 'DatabaseWindow')
const ChangelogWindow = lazyNamed(() => import('@/components/windows/ChangelogWindow'), 'ChangelogWindow')
const SystemLogsWindow = lazyNamed(() => import('@/components/windows/SystemLogsWindow'), 'SystemLogsWindow')
const HostTerminalWindow = lazyNamed(() => import('@/components/windows/HostTerminalWindow'), 'HostTerminalWindow')
const DocsWindow = lazyDefault(() => import('@/components/windows/DocsWindow'))
const FileManagerWindow = lazyNamed(() => import('@/components/windows/FileManagerWindow'), 'FileManagerWindow')
const FileEditorWindow = lazyNamed(() => import('@/components/windows/FileEditorWindow'), 'FileEditorWindow')
const UsersWindow = lazyDefault(() => import('@/components/windows/UsersWindow'))
const ProjectsWindow = lazyDefault(() => import('@/components/windows/ProjectsWindow'))
const TunnelsWindow = lazyDefault(() => import('@/components/windows/TunnelsWindow'))
const ProfileWindow = lazyDefault(() => import('@/components/windows/ProfileWindow'))
const WidgetsWindow = lazyNamed(() => import('@/components/windows/WidgetsWindow'), 'WidgetsWindow')
import { DesktopWidgetLayer } from '@/components/widgets/DesktopWidgetLayer'
import { useWidgetStore } from '@/store/widgetStore'

import { LockScreen } from '@/components/desktop/LockScreen'
import { CommandPalette } from '@/components/common/CommandPalette'

const ADMIN_ONLY_WINDOW_KINDS = new Set<WindowKind>(['host-terminal', 'users', 'settings', 'database', 'system-logs'])

export function canAccessWindow(kind: WindowKind, role?: string | null) {
  if (role === 'admin' || role === 'superadmin') return true
  return !ADMIN_ONLY_WINDOW_KINDS.has(kind)
}

function PortainerPlaceholder() {
  const { t } = useI18n()
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
      <span className="text-4xl">🛡️</span>
      <p className="text-sm font-semibold" style={{ color: 'var(--win-text)' }}>
        {t('app.portainerTitle')}
      </p>
      <p className="max-w-xs text-xs leading-relaxed" style={{ color: 'var(--app-placeholder-copy)' }}>
        {t('app.portainerBody')}
      </p>
    </div>
  )
}

function TerminalPlaceholder() {
  const { t } = useI18n()
  return (
    <div className="rounded-lg p-4 font-mono text-xs leading-relaxed" style={{ background: 'var(--app-terminal-bg)', color: 'var(--app-terminal-text)' }}>
      <span style={{ color: 'var(--app-terminal-user)' }}>panel@ui</span>
      <span style={{ color: 'var(--app-terminal-separator)' }}>:</span>
      <span style={{ color: 'var(--app-terminal-text)' }}>~</span>$ {t('app.terminalHint')}
      <br />
      <span style={{ color: 'var(--app-terminal-muted)' }}>{t('app.terminalSubhint')}</span>
    </div>
  )
}

function TrashPlaceholder() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center h-24 gap-2" style={{ color: 'var(--sand-400)' }}>
      <span className="text-4xl">🗑️</span>
      <span className="text-sm">{t('app.trashEmpty')}</span>
    </div>
  )
}

function WindowFallback() {
  const { t } = useI18n()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
      <Loader2 size={32} className="animate-spin text-[var(--app-loading-spinner)] opacity-80" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-[var(--app-loading-text)]">{t('common.loadingApp')}</span>
        <span className="text-[11px] text-[var(--app-loading-meta)] uppercase tracking-widest font-medium">{t('common.loadingModule')}</span>
      </div>
    </div>
  )
}

const WINDOW_CONTENT: Partial<Record<WindowKind, (win: WindowState, authenticated: boolean) => React.ReactNode>> = {
  apps: (win, auth) => <DockerWindow win={win} authenticated={auth} />,
  system: (_win, auth) => <SystemWindow authenticated={auth} />,
  'system-logs': (win, auth) => <SystemLogsWindow win={win} authenticated={auth} />,
  'host-terminal': (_win, auth) => <HostTerminalWindow authenticated={auth} />,
  portainer: () => <PortainerPlaceholder />,
  terminal: () => <TerminalPlaceholder />,
  docs: () => <DocsWindow />,
  changelog: () => <ChangelogWindow />,
  settings: (_win, auth) => <SettingsWindow authenticated={auth} />,
  database: (_win, auth) => <DatabaseWindow authenticated={auth} />,
  'file-manager': (win, auth) => <FileManagerWindow win={win} authenticated={auth} />,
  'file-editor': (_win, auth) => <FileEditorWindow authenticated={auth} />,
  trash: () => <TrashPlaceholder />,
  users: (win) => <UsersWindow win={win} />,
  projects: (win) => <ProjectsWindow win={win} />,
  tunnels: (win) => <TunnelsWindow win={win} />,
  profile: () => <ProfileWindow />,
  widgets: () => <WidgetsWindow />,
}

import { DesktopIcon } from '@/components/desktop/DesktopIcon'

const DESKTOP_SHORTCUTS: { id: string; label: string; windowId: WindowKind }[] = [
  { id: 'apps', label: 'Docker', windowId: 'apps' },
  { id: 'host-terminal', label: 'Terminal', windowId: 'host-terminal' },
  { id: 'widgets', label: 'Widgets', windowId: 'widgets' },
  { id: 'tunnels', label: 'Cloudflare', windowId: 'tunnels' },
  { id: 'projects', label: 'Projects', windowId: 'projects' },
  { id: 'database', label: 'Database', windowId: 'database' },
  { id: 'file-manager', label: 'Files', windowId: 'file-manager' },
  { id: 'system', label: 'System', windowId: 'system' },
  { id: 'users', label: 'Users', windowId: 'users' },
  { id: 'settings', label: 'Settings', windowId: 'settings' },
  { id: 'docs', label: 'Docs', windowId: 'docs' },
]

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

  const handleDesktopDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/ypanel-widget') || e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDesktopDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const rawType = e.dataTransfer.getData('application/ypanel-widget') || e.dataTransfer.getData('text/plain')
    if (rawType && ['clock-uptime', 'system-vital', 'network-traffic', 'quick-note', 'cpu-graph'].includes(rawType)) {
      e.preventDefault()
      const minSafeX = typeof window !== 'undefined' && window.innerWidth >= 640 ? 200 : 16
      const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280
      const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
      const dropX = Math.max(minSafeX, Math.min(screenW - 292, e.clientX - 140))
      const dropY = Math.max(56, Math.min(screenH - 120, e.clientY - 30))
      useWidgetStore.getState().addWidget(rawType as any, { x: dropX, y: dropY })
    }
  }

  return (
    <div
      ref={rootRef}
      className="desktop-root"
      style={backgroundStyle}
      onDragOver={handleDesktopDragOver}
      onDrop={handleDesktopDrop}
    >
      <Taskbar onLogout={onLogout} authenticated={authenticated} />

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
