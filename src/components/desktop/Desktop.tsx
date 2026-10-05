import React, { Suspense, useEffect, useMemo, useRef } from 'react'
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
}

import { DesktopIcon } from '@/components/desktop/DesktopIcon'

const DESKTOP_SHORTCUTS: { id: string; label: string; windowId: WindowKind }[] = [
  { id: 'apps', label: 'Docker', windowId: 'apps' },
  { id: 'host-terminal', label: 'Terminal', windowId: 'host-terminal' },
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
  const { getBackground, mode, wallpaper, syncCustomImage, customImageUrl, wallpaperLoading } = useThemeStore()
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

  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.style.background = getBackground()
    }
  }, [mode, wallpaper, customImageUrl])

  return (
    <div
      ref={rootRef}
      className="desktop-root"
      style={{ background: getBackground() }}
    >
      <Taskbar onLogout={onLogout} authenticated={authenticated} />

      {/* Desktop App Shortcuts (Left Grid) */}
      <div className="absolute top-14 left-4 z-[10] grid grid-flow-col grid-rows-6 gap-2 pointer-events-auto select-none">
        {desktopShortcuts.map((app) => (
          <DesktopIcon key={app.id} app={app} />
        ))}
      </div>

      <div className="absolute inset-0 pointer-events-none">
        {visibleWindows.map((win) => {
          const renderContent = WINDOW_CONTENT[win.kind]
          return (
            <div key={win.id} className="pointer-events-auto">
              <Window win={win}>
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
            </div>
          )
        })}
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
    </div>
  )
}
