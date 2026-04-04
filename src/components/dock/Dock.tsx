import { useState } from 'react'
import { useWindowStore } from '@/store/windowStore'
import type { WindowId } from '@/types'

const DOCK_ITEMS: { id: WindowId; icon: string; label: string }[] = [
  { id: 'apps',      icon: '📁', label: 'My Apps'  },
  { id: 'portainer', icon: '🐋', label: 'Portainer' },
  { id: 'terminal',  icon: '💻', label: 'Terminal'  },
  { id: 'system',    icon: '⚙️', label: 'System'    },
  { id: 'docs',      icon: '📚', label: 'Docs'      },
]

export function Dock() {
  const { openWindow, windows } = useWindowStore()
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div
      style={{
        position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid #e5e5e5',
        borderRadius: 14, padding: '7px 14px',
        display: 'flex', gap: 8, alignItems: 'flex-end',
        zIndex: 9999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}
    >
      {DOCK_ITEMS.map(item => {
        const isOpen = windows.some(w => w.id === item.id)
        const isHov = hovered === item.id
        return (
          <div
            key={item.id}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', position: 'relative' }}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => openWindow(item.id)}
          >
            {isHov && (
              <div style={{
                position: 'absolute', bottom: 58,
                background: '#0a0a0a', color: '#fff',
                fontSize: 11, fontWeight: 500,
                padding: '3px 8px', borderRadius: 5,
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {item.label}
              </div>
            )}
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: '#f5f5f5', border: '1px solid #e5e5e5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
              transition: 'transform .15s',
              transform: isHov ? 'scale(1.2) translateY(-5px)' : 'scale(1)',
            }}>
              {item.icon}
            </div>
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: '#0a0a0a',
              opacity: isOpen ? 1 : 0,
              transition: 'opacity .15s',
            }} />
          </div>
        )
      })}
    </div>
  )
}
