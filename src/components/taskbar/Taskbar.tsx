import { useState, useEffect } from 'react'
import { FileText, Monitor, RotateCcw, ScrollText } from 'lucide-react'
import { logoutAgent, getMe } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useWindowStore } from '@/store/windowStore'
import { ProfileMenu } from './ProfileMenu'
import type { WindowKind } from '@/types'

interface TaskbarProps {
  onLogout: () => void
}

function formatDateTime(value: Date) {
  const day = String(value.getDate()).padStart(2, '0')
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const year = value.getFullYear()
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

const QUICK_LAUNCH: { label: string; kind: WindowKind }[] = [
  { label: 'Apps', kind: 'apps' },
  { label: 'Portainer', kind: 'portainer' },
  { label: 'Terminal', kind: 'host-terminal' },
  { label: 'System', kind: 'system' },
  { label: 'Settings', kind: 'settings' },
  { label: 'Database', kind: 'database' },
  { label: 'Docs', kind: 'docs' },
]

export function Taskbar({ onLogout }: TaskbarProps) {
  const { openWindow, resetWindows } = useWindowStore()
  const [time, setTime] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [username, setUsername] = useState<string | undefined>(undefined)

  useEffect(() => {
    const tick = () => setTime(formatDateTime(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    getMe().then((me) => setUsername(me.username)).catch(() => {})
  }, [])

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      runtimeLogger.info('auth', 'logout requested from taskbar')
      await logoutAgent()
    } finally {
      onLogout()
      setLoggingOut(false)
    }
  }

  return (
    <div className="taskbar">
      <nav className="taskbar-nav">
        {QUICK_LAUNCH.map((item) => (
          <button
            key={item.kind}
            id={`taskbar-open-${item.kind}`}
            className="taskbar-nav-btn"
            onClick={() => openWindow(item.kind)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="taskbar-actions">
        <span id="taskbar-clock" className="taskbar-clock">{time}</span>

        <button id="taskbar-monitor" title="System Info" className="taskbar-icon-btn" onClick={() => openWindow('system')}>
          <Monitor size={14} />
        </button>

        <button id="taskbar-system-log" title="System Logs" className="taskbar-icon-btn" onClick={() => openWindow('system-logs')}>
          <ScrollText size={14} />
        </button>

        <button id="taskbar-runtime-log" title="Changelog" className="taskbar-icon-btn" onClick={() => openWindow('changelog')}>
          <FileText size={14} />
        </button>

        <button id="taskbar-reset-windows" title="Reset windows" className="taskbar-icon-btn" onClick={resetWindows}>
          <RotateCcw size={12} />
        </button>

        <ProfileMenu
          username={username}
          onLogout={handleLogout}
          loading={loggingOut}
        />
      </div>
    </div>
  )
}
