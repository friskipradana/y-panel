import { useState, useEffect } from 'react'
import { MoreHorizontal, Monitor, RotateCcw } from 'lucide-react'
import { useWindowStore } from '@/store/windowStore'

export function Taskbar() {
  const { openWindow, resetWindows } = useWindowStore()
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="fixed top-0 left-0 right-0 flex items-center justify-between select-none"
      style={{
        height: 44,
        zIndex: 9999,
        background: '#fff',
        borderBottom: '1px solid #e5e5e5',
        padding: '0 16px',
        gap: 0,
      }}
    >
      {/* Left side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Brand */}
        {/* <div className="flex items-center gap-2 mr-4">
          <div
            className="w-5 h-5 rounded"
            style={{ background: '#0a0a0a' }}
          />
        </div> */}

        {/* Nav items */}
        <div className='flex gap-0'>
          {([
            { label: 'Apps', id: 'apps' },
            { label: 'Terminal', id: 'terminal' },
            { label: 'System', id: 'system' },
            { label: 'Docs', id: 'docs' },
          ] as const).map((item) => (
            <button
              key={item.id}
              onClick={() => openWindow(item.id)}
              style={{
                fontSize: 14,
                color: '#525252',
                padding: '4px 10px',
                borderRadius: 6,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 500,
                transition: 'background .1s, color .1s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f5f5f5'
                e.currentTarget.style.color = '#0a0a0a'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#525252'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

      </div>
      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Search */}
        {/* <button
          onClick={() => openWindow('search' as any)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: '#a3a3a3',
            padding: '5px 10px', borderRadius: 6,
            background: '#f5f5f5', border: '1px solid #e5e5e5',
            cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
          }}
        >
          <Search size={12} />
          Search
        </button> */}

        {/* Add app */}
        {/* <button
          onClick={() => openWindow('apps')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 600, color: '#fff',
            padding: '5px 11px', borderRadius: 6,
            background: '#0a0a0a', border: 'none',
            cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
          }}
        >
          <Plus size={12} />
          App
        </button> */}

        {/* Clock */}
        <span
          style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#a3a3a3',
            minWidth: 36,
            textAlign: 'right',
          }}
        >
          {time}
        </span>

        {/* Monitoring */}
        <button
          style={{
            width: 20, height: 20, borderRadius: 7,
            background: '#0a0a0a', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <Monitor size={14} />
        </button>

        {/* Reset windows (debug) */}
        <button
          id="taskbar-reset-windows"
          title="Reset windows"
          onClick={resetWindows}
          style={{
            width: 20, height: 20, borderRadius: 7,
            background: '#0a0a0a', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <RotateCcw size={12} />
        </button>

        {/* More */}
        <button
          id="taskbar-more"
          style={{
            width: 20, height: 20, borderRadius: 7,
            background: '#0a0a0a', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  )
}
