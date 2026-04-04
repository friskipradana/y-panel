import { useState, useEffect } from 'react'
import { LogOut, Monitor, RotateCcw } from 'lucide-react'
import { logoutAgent } from '@/api/agent'
import { useWindowStore } from '@/store/windowStore'
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
  { label: 'Terminal', kind: 'host-terminal' },
  { label: 'System', kind: 'system' },
  { label: 'Docs', kind: 'docs' },
]

export function Taskbar({ onLogout }: TaskbarProps) {
  const { openWindow, resetWindows } = useWindowStore()
  const [time, setTime] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const tick = () => setTime(formatDateTime(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await logoutAgent()
    } finally {
      onLogout()
      setLoggingOut(false)
    }
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 flex items-center justify-between select-none"
      style={{
        height: 44,
        zIndex: 9999,
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(226,232,240,0.85)',
        padding: '0 16px',
        gap: 16,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-full px-1 py-1" style={{ background: 'rgba(255,255,255,0.62)', border: '1px solid rgba(226,232,240,0.9)' }}>
          {QUICK_LAUNCH.map((item) => (
            <button
              key={item.kind}
              id={`taskbar-open-${item.kind}`}
              onClick={() => openWindow(item.kind)}
              style={taskbarButtonStyle}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span
          id="taskbar-clock"
          style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#64748b',
            minWidth: 156,
            textAlign: 'right',
          }}
        >
          {time}
        </span>

        <button
          id="taskbar-monitor"
          onClick={() => openWindow('system')}
          style={iconButtonStyle}
        >
          <Monitor size={14} />
        </button>

        <button
          id="taskbar-reset-windows"
          title="Reset windows"
          onClick={resetWindows}
          style={iconButtonStyle}
        >
          <RotateCcw size={12} />
        </button>

        <button
          id="taskbar-logout"
          title="Logout"
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            minWidth: 78,
            height: 30,
            borderRadius: 999,
            background: loggingOut ? '#64748b' : '#0f172a',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: loggingOut ? 'wait' : 'pointer',
            color: '#fff',
            fontSize: 12,
            padding: '0 14px',
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          <LogOut size={12} />
          {loggingOut ? 'Wait' : 'Logout'}
        </button>
      </div>
    </div>
  )
}

const taskbarButtonStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#475569',
  padding: '6px 12px',
  borderRadius: 999,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 500,
}

const iconButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(226,232,240,0.9)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#0f172a',
}
