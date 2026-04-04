import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Taskbar } from '@/components/taskbar/Taskbar'
import { Dock } from '@/components/dock/Dock'
import { Window } from '@/components/desktop/Window'
import { AppsWindow } from '@/components/windows/AppsWindow'
import { SystemWindow } from '@/components/windows/SystemWindow'
import { LoginScreen } from '@/components/windows/LoginScreen'
import { HostTerminalWindow } from '@/components/windows/HostTerminalWindow'
import { useWindowStore } from '@/store/windowStore'
import { getMe } from '@/api/agent'
import type { WindowKind } from '@/types'
import { DebugPanel } from '@/components/debug/DebugPanel'
import { DebugGrid } from './components/debug/DebugGrid'

const LOGIN_PATH = import.meta.env.VITE_LOGIN_PATH || '/login'

const WINDOW_CONTENT: Partial<Record<WindowKind, () => React.ReactNode>> = {
  apps: () => <AppsWindow />,
  system: () => <SystemWindow />,
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
        { icon: '🚀', title: 'Bootstrap install', cmd: 'sudo bash installer/linux/install.sh' },
        { icon: '🧠', title: 'Agent health', cmd: 'curl http://127.0.0.1:8787/healthz' },
        { icon: '📦', title: 'Portainer logs', cmd: 'docker logs -f ui-panel-portainer' },
        { icon: '🪵', title: 'Agent logs', cmd: 'journalctl -u ui-panel -f' },
        { icon: '💻', title: 'Host terminal', cmd: 'Buka window Host Terminal dari panel desktop' },
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
  changelog: () => (
    <div>
      {[
        { v: 'v0.4.0', d: 'Hari ini', items: ['Simplified login screen', 'Host terminal execution via Go agent', 'Safer deploy automation'] },
        { v: 'v0.3.0', d: 'Hari ini', items: ['Frontend served by Go agent', 'CLI ui-panel install helper', 'Container actions through Go backend'] },
        { v: 'v0.2.0', d: 'Hari ini', items: ['Go panel agent bootstrap', 'Linux installer shell', 'Frontend login screen ke agent'] },
      ].map((c) => (
        <div key={c.v} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-white px-2 py-0.5 rounded-md" style={{ background: 'var(--accent)' }}>
              {c.v}
            </span>
            <span className="text-xs" style={{ color: 'var(--sand-400)' }}>{c.d}</span>
          </div>
          {c.items.map((i) => (
            <p key={i} className="text-xs pl-2 leading-relaxed" style={{ color: 'var(--sand-500)' }}>• {i}</p>
          ))}
        </div>
      ))}
    </div>
  ),
  settings: () => <SystemWindow />,
  trash: () => (
    <div className="flex flex-col items-center justify-center h-24 gap-2" style={{ color: 'var(--sand-400)' }}>
      <span className="text-4xl">🗑️</span>
      <span className="text-sm">Trash is empty</span>
    </div>
  ),
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
})

function Desktop({ onLogout }: { onLogout: () => void }) {
  const { windows } = useWindowStore()

  return (
    <div className="wallpaper w-screen h-screen relative overflow-hidden">
      <Taskbar onLogout={onLogout} />
      <div className="absolute inset-0">
        {windows.map((win) => {
          const renderContent = WINDOW_CONTENT[win.kind]
          return (
            <Window key={win.id} win={win}>
              {renderContent ? renderContent() : (
                <p className="text-sm" style={{ color: 'var(--sand-400)' }}>No content.</p>
              )}
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

    getMe()
      .then(() => {
        if (cancelled) return
        setAuthenticated(true)
        syncLoggedInRoute()
      })
      .catch(() => {
        if (cancelled) return
        setAuthenticated(false)
        syncLoggedOutRoute()
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })

    const handleSessionExpired = () => {
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
          Mengecek session bootstrap agent...
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <LoginScreen onLoginSuccess={() => {
      setAuthenticated(true)
      if (window.location.pathname === LOGIN_PATH) {
        window.history.replaceState({}, '', '/')
      }
    }} />
  }

  return (
    <>
      <Desktop onLogout={handleLogout} />
      <DebugPanel />
      <DebugGrid />
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
