import { motion, AnimatePresence } from 'framer-motion'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { GlobalAlert } from '@/components/alert/GlobalAlert'
import { Taskbar } from '@/components/taskbar/Taskbar'
import { Dock } from '@/components/dock/Dock'
import { Window } from '@/components/desktop/Window'
import { StatusPage } from '@/components/system/StatusPage'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { getFrontendRevision, getMe, getMeV2 } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import type { WindowKind, WindowState } from '@/types'

import { DockerWindow } from '@/components/windows/DockerWindow'
import { SystemWindow } from '@/components/windows/SystemWindow'
import { SettingsWindow } from '@/components/windows/SettingsWindow'
import { DatabaseWindow } from '@/components/windows/DatabaseWindow'
import { ChangelogWindow } from '@/components/windows/ChangelogWindow'
import { SystemLogsWindow } from '@/components/windows/SystemLogsWindow'
import { LoginScreen } from '@/components/windows/LoginScreen'
import { HostTerminalWindow } from '@/components/windows/HostTerminalWindow'
import DocsWindow from '@/components/windows/DocsWindow'
import { FileManagerWindow } from '@/components/windows/FileManagerWindow'
import { FileEditorWindow } from '@/components/windows/FileEditorWindow'
import UsersWindow from '@/components/windows/UsersWindow'
import ProjectsWindow from '@/components/windows/ProjectsWindow'
import TunnelsWindow from '@/components/windows/TunnelsWindow'
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('@/components/debug/DebugPanel').then((module) => ({ default: module.DebugPanel })))
  : null
const DebugGrid = import.meta.env.DEV
  ? lazy(() => import('@/components/debug/DebugGrid').then((module) => ({ default: module.DebugGrid })))
  : null

const LOGIN_PATH = import.meta.env.VITE_LOGIN_PATH || '/login'
const SHOW_DEBUG_OVERLAY = import.meta.env.DEV
const PUBLIC_APP_PATHS = new Set([LOGIN_PATH, '/'])

const WINDOW_CONTENT: Partial<Record<WindowKind, (win: WindowState, authenticated: boolean) => React.ReactNode>> = {
  apps: (win, auth) => <DockerWindow win={win} authenticated={auth} />,
  system: (_win, auth) => <SystemWindow authenticated={auth} />,
  'system-logs': (win, auth) => <SystemLogsWindow win={win} authenticated={auth} />,
  'host-terminal': (_win, auth) => <HostTerminalWindow authenticated={auth} />,
  portainer: () => (
    <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
      <span className="text-4xl">🛡️</span>
      <p className="text-sm font-semibold" style={{ color: 'var(--win-text)' }}>
        Portainer sekarang diamankan di localhost.
      </p>
      <p className="max-w-xs text-xs leading-relaxed" style={{ color: 'rgba(226,232,240,0.74)' }}>
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
  docs: () => <DocsWindow />,
  changelog: () => <ChangelogWindow />,
  settings: (_win, auth) => <SettingsWindow authenticated={auth} />,
  database: (_win, auth) => <DatabaseWindow authenticated={auth} />,
  'file-manager': (win, auth) => <FileManagerWindow win={win} authenticated={auth} />,
  'file-editor': (_win, auth) => <FileEditorWindow authenticated={auth} />,
  trash: () => (
    <div className="flex flex-col items-center justify-center h-24 gap-2" style={{ color: 'var(--sand-400)' }}>
      <span className="text-4xl">🗑️</span>
      <span className="text-sm">Trash is empty</span>
    </div>
  ),
  users: (win) => <UsersWindow win={win} />,
  projects: (win) => <ProjectsWindow win={win} />,
  tunnels: (win) => <TunnelsWindow win={win} />,
}

const ADMIN_ONLY_WINDOW_KINDS = new Set<WindowKind>(['host-terminal', 'users', 'settings', 'database', 'system-logs'])

function canAccessWindow(kind: WindowKind, role?: string | null) {
  if (role === 'admin' || role === 'superadmin') return true
  return !ADMIN_ONLY_WINDOW_KINDS.has(kind)
}

function WindowFallback() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
      <Loader2 size={32} className="animate-spin text-sky-500 opacity-80" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-slate-600">Menyiapkan Aplikasi</span>
        <span className="text-[11px] text-slate-400 uppercase tracking-widest font-medium">Sedang memuat modul...</span>
      </div>
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
})

function Desktop({ onLogout, authenticated }: { onLogout: () => void; authenticated: boolean }) {
  const { windows } = useWindowStore()
  const { getBackground, mode, wallpaper, syncCustomImage, customImageUrl, wallpaperLoading } = useThemeStore()
  const rootRef = useRef<HTMLDivElement>(null)
  const meRaw = typeof window !== 'undefined' ? window.localStorage.getItem('me-v2-cache') : null
  const me = meRaw ? JSON.parse(meRaw) as { role?: string } : null
  const userRole = me?.role ?? null
  const visibleWindows = useMemo(
    () => windows.filter((win) => canAccessWindow(win.kind, userRole)),
    [userRole, windows],
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
      <div className="absolute inset-0">
        {visibleWindows.map((win) => {
          const renderContent = WINDOW_CONTENT[win.kind]
          return (
            <Window key={win.id} win={win}>
              <Suspense fallback={<WindowFallback />}>
                {renderContent ? renderContent(win, authenticated) : (
                  <p className="text-sm" style={{ color: 'var(--sand-400)' }}>No content.</p>
                )}
              </Suspense>
            </Window>
          )
        })}
      </div>
      <Dock />
      {authenticated && wallpaperLoading ? (
        <div className="pointer-events-none absolute inset-0 z-[1200] flex items-center justify-center bg-[color:rgba(6,10,20,0.28)] backdrop-blur-md">
          <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium text-white shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
            <Loader2 size={16} className="animate-spin text-cyan-300" />
            <span>Menyiapkan wallpaper desktop...</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FrontendNotFoundPage({ authenticated }: { authenticated: boolean }) {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

  return (
    <StatusPage
      code="404"
      title="Halaman aplikasi tidak ditemukan"
      description="Route yang Anda buka tidak tersedia di frontend UI Panel yang sedang aktif. Anda masih berada di dalam runtime aplikasi, tetapi halaman ini memang tidak dikenali oleh shell frontend."
      hint="Gunakan route yang tersedia seperti / atau /login. Jika ini seharusnya route valid, periksa frontend revision yang aktif atau hasil deploy terbaru."
      badge="Frontend Route"
      eyebrow="App-level status page"
      details={[
        { label: 'Route aktif', value: currentPath },
        { label: 'Mode shell', value: 'Frontend-managed 404' },
      ]}
      actions={(
        <>
          <button
            id="status-page-back-home"
            type="button"
            className="status-page-action status-page-action-primary"
            onClick={() => {
              window.history.replaceState({}, '', '/')
              window.dispatchEvent(new Event('panel:navigation'))
            }}
          >
            Kembali ke dashboard
          </button>
          {!authenticated ? (
            <button
              id="status-page-go-login"
              type="button"
              className="status-page-action status-page-action-secondary"
              onClick={() => {
                window.history.replaceState({}, '', LOGIN_PATH)
                window.dispatchEvent(new Event('panel:navigation'))
              }}
            >
              Buka login panel
            </button>
          ) : null}
        </>
      )}
    />
  )
}

// Singleton promise to ensure session check only happens once per page load
let sessionCheckPromise: Promise<any> | null = null

function AppShell() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)
  const frontendRevisionRef = useRef<string | null>(null)
  const sessionCheckStarted = useRef(false)

  const isKnownPath = useMemo(() => {
    if (currentPath === '/' || currentPath === LOGIN_PATH) {
      return true
    }
    return PUBLIC_APP_PATHS.has(currentPath)
  }, [currentPath])

  useEffect(() => {
    const syncPath = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', syncPath)
    window.addEventListener('panel:navigation', syncPath)
    return () => {
      window.removeEventListener('popstate', syncPath)
      window.removeEventListener('panel:navigation', syncPath)
    }
  }, [])

  useEffect(() => {
    if (sessionCheckStarted.current) return
    sessionCheckStarted.current = true

    let cancelled = false

    const replaceRoute = (nextPath: string) => {
      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath)
        setCurrentPath(nextPath)
      }
    }

    const syncLoggedOutRoute = () => {
      if (window.location.pathname === '/' || window.location.pathname === LOGIN_PATH) {
        replaceRoute(LOGIN_PATH)
      }
    }

    const syncLoggedInRoute = () => {
      if (window.location.pathname === LOGIN_PATH) {
        replaceRoute('/')
      }
    }

    if (!sessionCheckPromise) {
      runtimeLogger.info('auth', 'checking existing session')
      sessionCheckPromise = getMe()
    }

    sessionCheckPromise
      .then((me) => {
        if (cancelled) return
        runtimeLogger.info('auth', 'existing session restored', { username: me.username })
        setAuthenticated(true)
        void getMeV2()
          .then((fullMe) => {
            window.localStorage.setItem('me-v2-cache', JSON.stringify({
              id: fullMe.id,
              username: fullMe.username,
              displayName: fullMe.displayName,
              role: fullMe.role,
            }))
          })
          .catch(() => {
            window.localStorage.removeItem('me-v2-cache')
          })
        syncLoggedInRoute()
      })
      .catch((error) => {
        if (cancelled) return
        if (error.response?.status !== 401) {
          runtimeLogger.warn('auth', 'session check failed', { error })
        }
        setAuthenticated(false)
        window.localStorage.removeItem('me-v2-cache')
        syncLoggedOutRoute()
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })

    const handleSessionExpired = () => {
      runtimeLogger.warn('auth', 'session expired, resetting shell state')
      queryClient.clear()
      useWindowStore.getState().resetWindows()
      window.localStorage.removeItem('me-v2-cache')
      setAuthenticated(false)
      replaceRoute(LOGIN_PATH)
    }

    window.addEventListener('panel:session-expired', handleSessionExpired)

    return () => {
      cancelled = true
      window.removeEventListener('panel:session-expired', handleSessionExpired)
    }
  }, [])

  useEffect(() => {
    let disposed = false

    const syncFrontendRevision = async () => {
      // Don't check if tab is hidden to save resources
      if (document.visibilityState !== 'visible') {
        return
      }

      try {
        const response = await getFrontendRevision()
        if (disposed) return

        const nextRevision = response.revision || 'unknown'
        if (!frontendRevisionRef.current) {
          frontendRevisionRef.current = nextRevision
          return
        }

        if (frontendRevisionRef.current !== nextRevision) {
          runtimeLogger.info('frontend', 'new deployed frontend revision detected, reloading client', {
            previousRevision: frontendRevisionRef.current,
            nextRevision,
          })
          frontendRevisionRef.current = nextRevision

          // Clear cache before reload to ensure we get the latest assets
          if ('caches' in window) {
            try {
              const cacheNames = await caches.keys()
              await Promise.all(cacheNames.map(name => caches.delete(name)))
            } catch (e) {
              runtimeLogger.warn('frontend', 'failed to clear caches', { error: e })
            }
          }

          window.location.reload()
        }
      }
      catch (error) {
        runtimeLogger.warn('frontend', 'failed to check frontend revision', { error })
      }
    }

    void syncFrontendRevision()
    const intervalId = window.setInterval(() => {
      void syncFrontendRevision()
    }, 8000)

    window.addEventListener('visibilitychange', syncFrontendRevision)

    return () => {
      disposed = true
      window.clearInterval(intervalId)
      window.removeEventListener('visibilitychange', syncFrontendRevision)
    }
  }, [authenticated])

  const handleLogout = () => {
    runtimeLogger.info('auth', 'manual logout requested from desktop')
    queryClient.clear()
    useWindowStore.getState().resetWindows()
    window.localStorage.removeItem('me-v2-cache')
    setAuthenticated(false)
    if (window.location.pathname !== LOGIN_PATH) {
      window.history.replaceState({}, '', LOGIN_PATH)
      setCurrentPath(LOGIN_PATH)
    }
  }

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (!authenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable
      if (isTyping && e.key !== 'Escape') return

      const { openWindow, closeWindow, focusedId } = useWindowStore.getState()
      const meRaw = window.localStorage.getItem('me-v2-cache')
      const me = meRaw ? JSON.parse(meRaw) as { role?: string } : null
      const userRole = me?.role ?? null
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

  if (checkingSession) {
    return (
      <div className="min-h-screen grid place-items-center text-white login-shell">
        <div className="glass-panel rounded-[28px] px-8 py-6 text-sm text-white/78">
          Mengecek session agent...
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Desktop selalu ada di background */}
      <motion.div
        animate={{
          filter: authenticated ? 'blur(0px)' : 'blur(20px)',
          scale: authenticated ? 1 : 1.05,
          opacity: authenticated ? 1 : 0.6
        }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        className="absolute inset-0 z-0"
      >
        <Desktop onLogout={handleLogout} authenticated={authenticated} />
      </motion.div>

      {/* Login Screen Overlay */}
      <AnimatePresence>
        {!authenticated && (
          <motion.div
            key="login-overlay"
            initial={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -window.innerHeight, scale: 1.1 }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 z-[10000] overflow-hidden"
          >
            {!isKnownPath && currentPath !== LOGIN_PATH ? (
              <FrontendNotFoundPage authenticated={authenticated} />
            ) : (
              <LoginScreen onLoginSuccess={() => {
                runtimeLogger.info('auth', 'login success propagated to app shell')
                setAuthenticated(true)
                void getMeV2()
                  .then((fullMe) => {
                    window.localStorage.setItem('me-v2-cache', JSON.stringify({
                      id: fullMe.id,
                      username: fullMe.username,
                      displayName: fullMe.displayName,
                      role: fullMe.role,
                    }))
                  })
                  .catch(() => {
                    window.localStorage.removeItem('me-v2-cache')
                  })
                if (window.location.pathname === LOGIN_PATH) {
                  window.history.replaceState({}, '', '/')
                  setCurrentPath('/')
                }
              }} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 404 Overlay for Authenticated Users */}
      {authenticated && !isKnownPath && (
        <div className="absolute inset-0 z-[20000]">
          <FrontendNotFoundPage authenticated={authenticated} />
        </div>
      )}

      {/* Debug Overlays */}
      {SHOW_DEBUG_OVERLAY && DebugPanel && DebugGrid && authenticated ? (
        <Suspense fallback={null}>
          <DebugPanel />
          <DebugGrid />
        </Suspense>
      ) : null}
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalAlert />
      <Toaster theme="dark" position="top-center" richColors />
      <AppShell />
    </QueryClientProvider>
  )
}
