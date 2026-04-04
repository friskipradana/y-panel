import type { AppShortcut } from '@/types'
import { useWindowStore } from '@/store/windowStore'

interface Props { app: AppShortcut }

export function DesktopIcon({ app }: Props) {
  const { openWindow } = useWindowStore()

  const handleDoubleClick = () => {
    if (app.url) window.open(app.url, '_blank')
    else if (app.windowId) openWindow(app.windowId)
  }

  return (
    <div
      style={{ width: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '7px 5px', borderRadius: 8, cursor: 'pointer', transition: 'background .1s' }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 10,
        background: 'rgba(255,255,255,0.85)',
        border: '1px solid rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}>
        {app.icon}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 500,
        color: '#2a1f0e',
        textAlign: 'center', lineHeight: 1.3,
        textShadow: '0 1px 2px rgba(255,255,255,0.5)',
      }}>
        {app.label}
      </span>
    </div>
  )
}
