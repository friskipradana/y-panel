import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Taskbar } from '@/components/taskbar/Taskbar'
import { Dock } from '@/components/dock/Dock'
import { Window } from '@/components/desktop/Window'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { getMe } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import type { WindowKind } from '@/types'

const AppsWindow = lazy(() => import('@/components/windows/AppsWindow').then((module) => ({ default: module.AppsWindow })))
const SystemWindow = lazy(() => import('@/components/windows/SystemWindow').then((module) => ({ default: module.SystemWindow })))
const SettingsWindow = lazy(() => import('@/components/windows/SettingsWindow').then((module) => ({ default: module.SettingsWindow })))
const DatabaseWindow = lazy(() => import('@/components/windows/DatabaseWindow').then((module) => ({ default: module.DatabaseWindow })))
const ChangelogWindow = lazy(() => import('@/components/windows/ChangelogWindow').then((module) => ({ default: module.ChangelogWindow })))
const SystemLogsWindow = lazy(() => import('@/components/windows/SystemLogsWindow').then((module) => ({ default: module.SystemLogsWindow })))
const LoginScreen = lazy(() => import('@/components/windows/LoginScreen').then((module) => ({ default: module.LoginScreen })))
const HostTerminalWindow = lazy(() => import('@/components/windows/HostTerminalWindow').then((module) => ({ default: module.HostTerminalWindow })))
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('@/components/debug/DebugPanel').then((module) => ({ default: module.DebugPanel })))
  : null
const DebugGrid = import.meta.env.DEV
  ? lazy(() => import('@/components/debug/DebugGrid').then((module) => ({ default: module.DebugGrid })))
  : null

const LOGIN_PATH = import.meta.env.VITE_LOGIN_PATH || '/login'
const SHOW_DEBUG_OVERLAY = import.meta.env.DEV

const WINDOW_CONTENT: Partial<Record<WindowKind, () => React.ReactNode>> = {
  apps: () => <AppsWindow />,
  system: () => <SystemWindow />,
  'system-logs': () => <SystemLogsWindow />,
  'host-terminal': () => <HostTerminalWindow />,
  portainer: () => (
    <div className="flex flex-col items-center justify-center gap-3 h-40 text-center">
      <span className="text-4xl">🛡️</span>
      <p className="text-sm font-medium" style={{ color: 'var(--sand-600)' }}>
        Portainer sekarang diamankan di localhost.
      </p>
      <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'var(--sand-400)' }}>
        Semua operasi container harus melewati backend Go agent. Gunakan menu Apps untuk kontrol container.
      </p>
    </div>
  ),
  terminal: () => (
    <div className="rounded-lg p-4 font-mono text-xs leading-relaxed" style={{ background: '#1a1108', color: '#c8f59a' }}>
      <span style={{ color: '#f76707' }}>panel@ui</span>
      <span style={{ color: 'white' }}>:</span>
      <span style={{ color: '#c8f59a' }}>~</span>$ buka window <strong>Host Terminal</strong> untuk akses shell host Linux.
      <br />
      <span style={{ color: '#888' }}>Window ini sekarang dipakai sebagai petunjuk singkat.</span>
    </div>
  ),
  docs: () => (
    <div className="flex flex-col gap-2">
      {[
        { icon: '🚀', title: 'Install panel', cmd: 'sudo bash installer/linux/install.sh' },
        { icon: '🧠', title: 'Agent health', cmd: 'curl http://127.0.0.1:8787/healthz' },
        { icon: '📦', title: 'Portainer logs', cmd: 'docker logs -f ui-panel-portainer' },
        { icon: '🪵', title: 'Agent logs', cmd: 'journalctl -u ui-panel -f' },
        { icon: '💻', title: 'Host terminal', cmd: 'Buka window Host Terminal dari panel desktop' },
        { icon: '📜', title: 'System logs panel', cmd: 'Buka tombol log di taskbar untuk melihat journalctl service' },
        { icon: '🔁', title: 'Restart panel', cmd: 'ui-panel restart' },
        { icon: '🧹', title: 'Uninstall', cmd: 'ui-panel uninstall' },
      ].map((d) => (
        <div key={d.title} className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.07)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--sand-600)' }}>{d.icon} {d.title}</p>
          <code className="text-xs" style={{ color: 'var(--sand-400)', fontFamily: 'monospace' }}>{d.cmd}</code>
        </div>
      ))}
    </div>
  ),
  changelog: () => <ChangelogWindow />,
  settings: () => <SettingsWindow />,
  database: () => <DatabaseWindow />,
  trash: () => (
    <div className="flex flex-col items-center justify-center h-24 gap-2" style={{ color: 'var(--sand-400)' }}>
      <span className="text-4xl">🗑️</span>
      <span className="text-sm">Trash is empty</span>
    </div>
  ),
}

function WindowFallback() {
  return (
    <div className="flex min-h-[140px] items-center justify-center text-sm" style={{ color: 'var(--sand-400)' }}>
      Memuat modul window...
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
})

function Desktop({ onLogout }: { onLogout: () => void }) {
  const { windows } = useWindowStore()
  const { getBackground, mode, wallpaper } = useThemeStore()
  const rootRef = useRef<HTMLDivElement>(null)

  // Update background imperatively so we never unmount children (keeps dropdown open)
  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.style.background = getBackground()
    }
  }, [mode, wallpaper])

  return (
    <div
      ref={rootRef}
      className="desktop-root"
      style={{ background: getBackground() }}
    >
      <Taskbar onLogout={onLogout} />
      <div className="absolute inset-0">
        {windows.map((win) => {
          const renderContent = WINDOW_CONTENT[win.kind]
          return (
            <Window key={win.id} win={win}>
              <Suspense fallback={<WindowFallback />}>
                {renderContent ? renderContent() : (
                  <p className="text-sm" style={{ color: 'var(--sand-400)' }}>No content.</p>
                )}
              </Suspense>
            </Window>
          )
        })}
      </div>
      <Dock />
    </div>
  )
}

function AppShell() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false

    const syncLoggedOutRoute = () => {
      if (window.location.pathname !== LOGIN_PATH) {
        window.history.replaceState({}, '', LOGIN_PATH)
      }
    }

    const syncLoggedInRoute = () => {
      if (window.location.pathname === LOGIN_PATH) {
        window.history.replaceState({}, '', '/')
      }
    }

    runtimeLogger.info('auth', 'checking existing session')
    getMe()
      .then((me) => {
        if (cancelled) return
        runtimeLogger.info('auth', 'existing session restored', { username: me.username })
        setAuthenticated(true)
        syncLoggedInRoute()
      })
      .catch((error) => {
        if (cancelled) return
        runtimeLogger.warn('auth', 'no active session found', { error })
        setAuthenticated(false)
        syncLoggedOutRoute()
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })

    const handleSessionExpired = () => {
      runtimeLogger.warn('auth', 'session expired, resetting shell state')
      queryClient.clear()
      useWindowStore.getState().resetWindows()
      setAuthenticated(false)
      syncLoggedOutRoute()
    }

    window.addEventListener('panel:session-expired', handleSessionExpired)

    return () => {
      cancelled = true
      window.removeEventListener('panel:session-expired', handleSessionExpired)
    }
  }, [])

  const handleLogout = () => {
    runtimeLogger.info('auth', 'manual logout requested from desktop')
    queryClient.clear()
    useWindowStore.getState().resetWindows()
    setAuthenticated(false)
    if (window.location.pathname !== LOGIN_PATH) {
      window.history.replaceState({}, '', LOGIN_PATH)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen grid place-items-center text-white login-shell">
        <div className="glass-panel rounded-[28px] px-8 py-6 text-sm text-white/78">
          Mengecek session agent...
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <Suspense fallback={(
        <div className="min-h-screen grid place-items-center text-white login-shell">
          <div className="glass-panel rounded-[28px] px-8 py-6 text-sm text-white/78">
            Memuat login panel...
          </div>
        </div>
      )}>
        <LoginScreen onLoginSuccess={() => {
          runtimeLogger.info('auth', 'login success propagated to app shell')
          setAuthenticated(true)
          if (window.location.pathname === LOGIN_PATH) {
            window.history.replaceState({}, '', '/')
          }
        }} />
      </Suspense>
    )
  }

  return (
    <>
      <Desktop onLogout={handleLogout} />
      {SHOW_DEBUG_OVERLAY && DebugPanel && DebugGrid ? (
        <Suspense fallback={null}>
          <DebugPanel />
          <DebugGrid />
        </Suspense>
      ) : null}
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}
