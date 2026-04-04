import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Square, X, ChevronDown } from 'lucide-react'
import { useWindowStore, selectFocusedId } from '@/store/windowStore'
import type { WindowState } from '@/types'

interface Props {
  win: WindowState
  children: React.ReactNode
}

export function Window({ win, children }: Props) {
  const { closeWindow, minimizeWindow, maximizeWindow, focusWindow, moveWindow } = useWindowStore()
  const dragRef = useRef<{ ox: number; oy: number } | null>(null)

  const focusedId = useWindowStore(selectFocusedId)
  const isFocused = win.id === focusedId

  const handleBarMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    focusWindow(win.id)
    if (win.isMaximized) return
    dragRef.current = { ox: e.clientX - win.x, oy: e.clientY - win.y }
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      moveWindow(
        win.id,
        Math.max(0, e.clientX - dragRef.current.ox),
        Math.max(0, e.clientY - dragRef.current.oy)
      )
    }
    const onUp = () => {
      dragRef.current = null
      const currentWindow = useWindowStore.getState().windows.find((w) => w.id === win.id)
      if (currentWindow) {
        const viewportPadding = 8
        const minX = viewportPadding
        const minY = 44
        const maxX = Math.max(viewportPadding, window.innerWidth - currentWindow.width - viewportPadding)
        const maxY = Math.max(minY, window.innerHeight - currentWindow.height - viewportPadding)
        const clampedX = Math.min(Math.max(currentWindow.x, minX), maxX)
        const clampedY = Math.min(Math.max(currentWindow.y, minY), maxY)
        if (clampedX !== currentWindow.x || clampedY !== currentWindow.y) {
          moveWindow(win.id, clampedX, clampedY)
        }
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const style = win.isMaximized
    ? { left: 0, top: 44, width: '100vw', height: 'calc(100vh - 44px)', zIndex: win.zIndex }
    : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex }

  return (
    <AnimatePresence>
      {!win.isMinimized && (
        <motion.div
          key={win.id}
          // ✅ macOS-like: open dari bawah sedikit, cepat & snappy
          initial={{ scale: 0.96, opacity: 0, y: 6 }}
          animate={{
            scale: 1,
            opacity: 1,
            y: 0,
            // ✅ sedikit redup saat tidak fokus — mirip macOS
            filter: isFocused ? 'brightness(1)' : 'brightness(0.97)',
          }}
          // ✅ minimize: turun ke bawah seperti macOS
          exit={{ scale: 0.92, opacity: 0, y: 16 }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 38,
            // ✅ filter lebih lambat biar smooth
            filter: { duration: 0.2, ease: 'easeOut' },
          }}
          className="absolute flex flex-col overflow-hidden"
          style={{
            ...style,
            background: '#fff',
            borderRadius: 8,
            border: `1px solid ${isFocused ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)'}`,
            boxShadow: isFocused
              ? '0 12px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1)'
              : '0 4px 16px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
            transition: 'box-shadow 200ms ease, border-color 200ms ease',
          }}
          onMouseDown={() => focusWindow(win.id)}
        >
          {/* ── Title bar ── */}
          <div
            style={{
              height: 44,
              background: isFocused ? '#fff' : '#fafafa',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              cursor: 'move',
              flexShrink: 0,
              position: 'relative',
              transition: 'background 200ms ease',
            }}
            onMouseDown={handleBarMouseDown}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: 13 }}>{win.icon}</span>
              <span style={{
                fontSize: 13,
                fontWeight: 500,
                color: isFocused ? '#1a1a1a' : '#a3a3a3',
                transition: 'color 200ms ease',
              }}>
                {win.title}
              </span>
              <ChevronDown size={12} color="#a3a3a3" />
            </div>

            <div
              className="absolute right-1 flex items-center"
              style={{ gap: 2 }}
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                onClick={() => minimizeWindow(win.id)}
                style={{
                  width: 32, height: 32, border: 'none',
                  background: 'transparent', borderRadius: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#737373', transition: 'background .1s, color .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#0a0a0a' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#737373' }}
              >
                <Minus size={14} strokeWidth={1.5} />
              </button>

              <button
                onClick={() => maximizeWindow(win.id)}
                style={{
                  width: 32, height: 32, border: 'none',
                  background: 'transparent', borderRadius: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#737373', transition: 'background .1s, color .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#0a0a0a' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#737373' }}
              >
                <Square size={12} strokeWidth={1.5} />
              </button>

              <button
                onClick={() => closeWindow(win.id)}
                style={{
                  width: 32, height: 32, border: 'none',
                  background: 'transparent', borderRadius: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#737373', transition: 'background .1s, color .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#737373' }}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* ── Toolbar strip ── */}
          {win.id !== 'terminal' && (
            <div
              style={{
                height: 38,
                background: '#fafafa',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                gap: 3,
                flexShrink: 0,
              }}
            >
              {['B', 'I', 'U'].map(t => (
                <button
                  key={t}
                  style={{
                    width: 26, height: 26, border: 'none',
                    background: 'transparent', borderRadius: 4,
                    fontSize: t === 'B' ? 13 : 12,
                    fontWeight: t === 'B' ? 700 : 400,
                    fontStyle: t === 'I' ? 'italic' : 'normal',
                    textDecoration: t === 'U' ? 'underline' : 'none',
                    cursor: 'pointer', color: '#737373',
                    transition: 'background .1s',
                    fontFamily: 'Outfit, sans-serif',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {t}
                </button>
              ))}
              <div style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 4px' }} />
              <span style={{ fontSize: 11, color: '#a3a3a3', padding: '3px 7px', border: '1px solid #e5e5e5', borderRadius: 4, cursor: 'pointer' }}>
                Font ▾
              </span>
              <div style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 4px' }} />
              <span style={{ fontSize: 11, color: '#a3a3a3', padding: '3px 7px', border: '1px solid #e5e5e5', borderRadius: 4, cursor: 'pointer' }}>
                Zoom ▾
              </span>
            </div>
          )}

          {/* ── Content ── */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 18,
              fontSize: 13,
              color: '#525252',
              lineHeight: 1.7,
            }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}