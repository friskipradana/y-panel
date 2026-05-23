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
      onMouseEnter={e => e.currentTarget.style.background = 'var(--desktop-icon-hover-bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 10,
        background: 'var(--desktop-icon-surface)',
        border: '1px solid var(--desktop-icon-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        boxShadow: 'var(--desktop-icon-shadow)',
      }}>
        {app.icon}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 500,
        color: 'var(--desktop-icon-label-text)',
        textAlign: 'center', lineHeight: 1.3,
        textShadow: 'var(--desktop-icon-label-shadow)',
      }}>
        {app.label}
      </span>
    </div>
  )
}




