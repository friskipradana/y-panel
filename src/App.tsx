import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Taskbar } from '@/components/taskbar/Taskbar'
import { Dock } from '@/components/dock/Dock'
import { Window } from '@/components/desktop/Window'
import { DesktopIcon } from '@/components/desktop/DesktopIcon'
import { AppsWindow } from '@/components/windows/AppsWindow'
import { SystemWindow } from '@/components/windows/SystemWindow'
import { useWindowStore } from '@/store/windowStore'
import type { AppShortcut, WindowId } from '@/types'
import { DebugPanel } from '@/components/debug/DebugPanel'
import { DebugGrid } from './components/debug/DebugGrid'

const LEFT_ICONS: AppShortcut[] = [
  { id: '1', label: 'My Apps', icon: '📁', color: '#fff8e1', windowId: 'apps' },
  { id: '2', label: 'Grafana', icon: '📊', color: '#e8f5e9', url: 'http://localhost:3000' },
  { id: '3', label: 'Portainer', icon: '🐋', color: '#e3f2fd', windowId: 'portainer' },
  { id: '4', label: 'Uptime Kuma', icon: '💓', color: '#fce4ec', url: 'http://localhost:3001' },
  { id: '5', label: 'Terminal', icon: '💻', color: '#1a1108', windowId: 'terminal' },
  { id: '6', label: 'Settings', icon: '⚙️', color: '#f3e5f5', windowId: 'settings' },
]

const RIGHT_ICONS: AppShortcut[] = [
  { id: '7', label: 'Jellyfin', icon: '🎬', color: '#e8f5e9', url: 'http://localhost:8096' },
  { id: '8', label: 'Nextcloud', icon: '☁️', color: '#e3f2fd', url: 'http://localhost:8080' },
  { id: '9', label: 'Changelog', icon: '🔔', color: '#fff3e0', windowId: 'changelog' },
  { id: '10', label: 'Docs', icon: '📚', color: '#fce4ec', windowId: 'docs' },
  { id: '11', label: 'System', icon: '🖥️', color: '#f1f8e9', windowId: 'system' },
  { id: '12', label: 'Trash', icon: '🗑️', color: '#efebe9', windowId: 'trash' },
]

const WINDOW_CONTENT: Partial<Record<WindowId, React.ReactNode>> = {
  apps: <AppsWindow />,
  system: <SystemWindow />,
  portainer: (
    <div className="flex flex-col items-center justify-center gap-3 h-32">
      <span className="text-4xl">🐋</span>
      <a
        href="http://localhost:9000"
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium px-4 py-2 rounded-lg text-white"
        style={{ background: 'var(--accent)' }}
      >
        Buka Portainer →
      </a>
    </div>
  ),
  terminal: (
    <div className="rounded-lg p-4 font-mono text-xs leading-relaxed" style={{ background: '#1a1108', color: '#c8f59a' }}>
      <span style={{ color: '#f76707' }}>user@myserver</span>
      <span style={{ color: 'white' }}>:</span>
      <span style={{ color: '#c8f59a' }}>~</span>$ docker ps<br />
      <span style={{ color: '#888' }}>CONTAINER ID &nbsp; IMAGE &nbsp;&nbsp;&nbsp;&nbsp; STATUS</span><br />
      a1b2c3d4 &nbsp; grafana &nbsp;&nbsp; Up 3 days<br />
      b2c3d4e5 &nbsp; portainer &nbsp; Up 3 days<br />
      c3d4e5f6 &nbsp; uptime &nbsp;&nbsp;&nbsp; Up 3 days<br />
      <br />
      <span style={{ color: '#f76707' }}>user@myserver</span>
      <span style={{ color: 'white' }}>:</span>
      <span style={{ color: '#c8f59a' }}>~</span>$ <span className="animate-pulse">█</span>
      <p className="mt-3 text-xs" style={{ color: '#555' }}>
        Untuk terminal aktif, gunakan SSH atau install Wetty di server.
      </p>
    </div>
  ),
  docs: (
    <div className="flex flex-col gap-2">
      {[
        { icon: '🐋', title: 'Start all containers', cmd: 'docker compose up -d' },
        { icon: '🌐', title: 'Cloudflare Tunnel', cmd: 'cloudflared tunnel run my-tunnel' },
        { icon: '🔄', title: 'Update semua image', cmd: 'docker compose pull && docker compose up -d' },
        { icon: '📋', title: 'Lihat logs container', cmd: 'docker logs -f <container_name>' },
        { icon: '💾', title: 'Backup volume', cmd: 'docker cp <container>:/data ./backup/' },
        { icon: '🔍', title: 'Cek resource usage', cmd: 'docker stats --no-stream' },
      ].map((d) => (
        <div key={d.title} className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.07)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--sand-600)' }}>{d.icon} {d.title}</p>
          <code className="text-xs" style={{ color: 'var(--sand-400)', fontFamily: 'monospace' }}>{d.cmd}</code>
        </div>
      ))}
    </div>
  ),
  changelog: (
    <div>
      {[
        { v: 'v1.2.0', d: 'Hari ini', items: ['Desktop UI React + Vite + TS', 'Zustand window manager', 'Live Docker stats via Portainer API'] },
        { v: 'v1.1.0', d: '3 hari lalu', items: ['Tambah Uptime Kuma', 'SSL otomatis via Cloudflare'] },
        { v: 'v1.0.0', d: '2 minggu lalu', items: ['Setup Docker Compose', 'Portainer + Grafana pertama kali'] },
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
  settings: <SystemWindow />,
  trash: (
    <div className="flex flex-col items-center justify-center h-24 gap-2" style={{ color: 'var(--sand-400)' }}>
      <span className="text-4xl">🗑️</span>
      <span className="text-sm">Trash is empty</span>
    </div>
  ),
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 5_000 } },
})

function Desktop() {
  const { windows } = useWindowStore()


  return (
    <div className="wallpaper w-screen h-screen relative overflow-hidden">
      <Taskbar />
      <div className="absolute inset-0">
        {/* Left column */}
        {/* <div className="absolute top-4 left-4 flex flex-col gap-1">
          {LEFT_ICONS.map((app) => <DesktopIcon key={app.id} app={app} />)}
        </div> */}
        {/* Right column */}
        {/* <div className="absolute top-4 right-4 flex flex-col gap-1">
          {RIGHT_ICONS.map((app) => <DesktopIcon key={app.id} app={app} />)}
        </div> */}
        {/* Open windows */}
        {windows.map((win) => (
          <Window key={win.id} win={win}>
            {WINDOW_CONTENT[win.id] ?? (
              <p className="text-sm" style={{ color: 'var(--sand-400)' }}>No content.</p>
            )}
          </Window>
        ))}
      </div>
      <Dock />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Desktop />
      <DebugPanel />
      <DebugGrid />
    </QueryClientProvider>
  )
}
