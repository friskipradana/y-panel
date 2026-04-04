import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Square, X, ChevronDown } from 'lucide-react'
import { useWindowStore, selectFocusedId } from '@/store/windowStore'
import type { WindowState } from '@/types'

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface Props {
  win: WindowState
  children: React.ReactNode
}

export function Window({ win, children }: Props) {
  const { closeWindow, minimizeWindow, maximizeWindow, focusWindow, moveWindow, resizeWindow } = useWindowStore()
  const dragRef = useRef<{ ox: number; oy: number } | null>(null)
  const [textAccent, setTextAccent] = useState({ bold: false, italic: false, underline: false })
  const [fontIndex, setFontIndex] = useState(0)
  const [zoomIndex, setZoomIndex] = useState(1)

  const focusedId = useWindowStore(selectFocusedId)
  const isFocused = win.id === focusedId

  const animation = useMemo(() => {
    if (win.lastAction === 'restore') {
      return {
        initial: { scale: 0.94, opacity: 0, y: 24 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: 0.9, opacity: 0, y: 26 },
      }
    }

    if (win.lastAction === 'minimize') {
      return {
        initial: { scale: 0.98, opacity: 1, y: 0 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: 0.82, opacity: 0, y: 42 },
      }
    }

    return {
      initial: { scale: 0.96, opacity: 0, y: 10 },
      animate: { scale: 1, opacity: 1, y: 0 },
      exit: { scale: 0.9, opacity: 0, y: 26 },
    }
  }, [win.lastAction])

  const handleBarMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    focusWindow(win.id)
    if (win.isMaximized) return
    dragRef.current = { ox: e.clientX - win.x, oy: e.clientY - win.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      moveWindow(
        win.id,
        Math.max(0, ev.clientX - dragRef.current.ox),
        Math.max(0, ev.clientY - dragRef.current.oy),
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
        const maxY = Math.max(minY, window.innerHeight - currentWindow.height - 72)
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

  const handleResizeStart = (direction: ResizeDirection, event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    focusWindow(win.id)
    if (win.isMaximized) return

    const startX = event.clientX
    const startY = event.clientY
    const initial = { x: win.x, y: win.y, width: win.width, height: win.height }
    const minWidth = win.kind === 'host-terminal' ? 640 : win.kind === 'system' ? 360 : 280
    const minHeight = win.kind === 'host-terminal' ? 420 : win.kind === 'system' ? 420 : 220
    const viewportPadding = 8
    const maxRight = window.innerWidth - viewportPadding
    const maxBottom = window.innerHeight - 14

    const onMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      let nextX = initial.x
      let nextY = initial.y
      let nextWidth = initial.width
      let nextHeight = initial.height

      if (direction.includes('e')) {
        nextWidth = Math.max(minWidth, Math.min(maxRight - initial.x, initial.width + deltaX))
      }
      if (direction.includes('s')) {
        nextHeight = Math.max(minHeight, Math.min(maxBottom - initial.y, initial.height + deltaY))
      }
      if (direction.includes('w')) {
        const candidateX = Math.min(initial.x + initial.width - minWidth, Math.max(viewportPadding, initial.x + deltaX))
        nextX = candidateX
        nextWidth = Math.max(minWidth, initial.width + (initial.x - candidateX))
      }
      if (direction.includes('n')) {
        const minTop = 44
        const candidateY = Math.min(initial.y + initial.height - minHeight, Math.max(minTop, initial.y + deltaY))
        nextY = candidateY
        nextHeight = Math.max(minHeight, initial.height + (initial.y - candidateY))
      }

      moveWindow(win.id, nextX, nextY)
      resizeWindow(win.id, nextWidth, nextHeight)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const contentFontFamily = FONT_OPTIONS[fontIndex] ?? FONT_OPTIONS[0]
  const contentZoom = ZOOM_OPTIONS[zoomIndex] ?? ZOOM_OPTIONS[1]

  const style = win.isMaximized
    ? { left: 0, top: 44, width: '100vw', height: 'calc(100vh - 44px)', zIndex: win.zIndex }
    : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex }

  return (
    <AnimatePresence>
      {!win.isMinimized && (
        <motion.div
          key={win.id}
          initial={animation.initial}
          animate={{
            ...animation.animate,
            filter: isFocused ? 'brightness(1)' : 'brightness(0.975)',
          }}
          exit={animation.exit}
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 32,
            mass: 0.9,
            filter: { duration: 0.18, ease: 'easeOut' },
          }}
          className="absolute flex flex-col overflow-hidden"
          style={{
            ...style,
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 24,
            border: `1px solid ${isFocused ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.56)'}`,
            boxShadow: isFocused
              ? '0 28px 70px rgba(15, 23, 42, 0.20), 0 10px 24px rgba(15, 23, 42, 0.08)'
              : '0 12px 36px rgba(15, 23, 42, 0.10), 0 4px 12px rgba(15, 23, 42, 0.05)',
            transition: 'box-shadow 200ms ease, border-color 200ms ease',
            backdropFilter: 'blur(22px)',
          }}
          onMouseDown={() => focusWindow(win.id)}
        >
          <div
            style={{
              height: 46,
              background: isFocused ? 'rgba(255,255,255,0.9)' : 'rgba(250,250,250,0.9)',
              borderBottom: '1px solid rgba(226,232,240,0.8)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
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
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: isFocused ? '#1a1a1a' : '#94a3b8',
                  transition: 'color 200ms ease',
                }}
              >
                {win.title}
              </span>
              <ChevronDown size={12} color="#a3a3a3" />
            </div>

            <div
              className="absolute right-1 flex items-center"
              style={{ gap: 2 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => minimizeWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => applyHover(e.currentTarget)}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
              >
                <Minus size={14} strokeWidth={1.5} />
              </button>

              <button
                onClick={() => maximizeWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => applyHover(e.currentTarget)}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
              >
                <Square size={12} strokeWidth={1.5} />
              </button>

              <button
                onClick={() => closeWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ef4444'
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {win.kind !== 'terminal' && (
            <div
              style={{
                height: 34,
                background: 'rgba(250,250,250,0.72)',
                borderBottom: '1px solid rgba(240,240,240,0.8)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                gap: 4,
                flexShrink: 0,
              }}
            >
              {[
                { key: 'bold', label: 'B' },
                { key: 'italic', label: 'I' },
                { key: 'underline', label: 'U' },
              ].map((item) => {
                const active = textAccent[item.key as keyof typeof textAccent]
                return (
                  <button
                    key={item.key}
                    style={{
                      ...toolbarToggleStyle,
                      ...(active ? activeToolbarToggleStyle : null),
                      fontSize: item.label === 'B' ? 13 : 12,
                      fontWeight: item.label === 'B' ? 700 : 400,
                      fontStyle: item.label === 'I' ? 'italic' : 'normal',
                      textDecoration: item.label === 'U' ? 'underline' : 'none',
                    }}
                    onClick={() => {
                      setTextAccent((current) => ({
                        ...current,
                        [item.key]: !current[item.key as keyof typeof current],
                      }))
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = '#f0f0f0'
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {item.label}
                  </button>
                )
              })}
              <div style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 4px' }} />
              <button
                type="button"
                style={toolbarChipStyle}
                onClick={() => setFontIndex((current) => (current + 1) % FONT_OPTIONS.length)}
              >
                Font · {FONT_LABELS[fontIndex]}
              </button>
              <div style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 4px' }} />
              <button
                type="button"
                style={toolbarChipStyle}
                onClick={() => setZoomIndex((current) => (current + 1) % ZOOM_OPTIONS.length)}
              >
                Zoom · {Math.round(contentZoom * 100)}%
              </button>
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: win.kind === 'system' ? '16px 16px 20px' : win.kind === 'docs' ? '14px 14px 18px' : '16px 16px 20px',
              fontSize: 12,
              color: '#525252',
              lineHeight: 1.65,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.82))',
            }}
          >
            <div
              style={{
                minHeight: '100%',
                fontFamily: contentFontFamily,
                fontWeight: textAccent.bold ? 600 : 400,
                fontStyle: textAccent.italic ? 'italic' : 'normal',
                textDecoration: textAccent.underline ? 'underline' : 'none',
                zoom: contentZoom,
                transformOrigin: 'top left',
              }}
            >
              {children}
            </div>
          </div>

          {!win.isMaximized && RESIZE_HANDLES.map((handle) => (
            <div
              key={handle.direction}
              onMouseDown={(event) => handleResizeStart(handle.direction, event)}
              style={{
                position: 'absolute',
                ...handle.style,
                cursor: handle.cursor,
                zIndex: 4,
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const controlButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: 'none',
  background: 'transparent',
  borderRadius: 9,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#737373',
  transition: 'background .1s, color .1s',
}

const toolbarToggleStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  border: 'none',
  background: 'transparent',
  borderRadius: 4,
  cursor: 'pointer',
  color: '#737373',
  transition: 'background .1s, color .1s, box-shadow .1s',
  fontFamily: 'Outfit, sans-serif',
}

const activeToolbarToggleStyle: React.CSSProperties = {
  background: 'rgba(59, 130, 246, 0.12)',
  color: '#2563eb',
  boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.18)',
}

const toolbarChipStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  padding: '4px 8px',
  border: '1px solid #e5e5e5',
  borderRadius: 999,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.85)',
}

const FONT_OPTIONS = [
  'Outfit, system-ui, sans-serif',
  'Inter, Outfit, system-ui, sans-serif',
  '"JetBrains Mono", monospace',
]

const FONT_LABELS = ['Outfit', 'Inter', 'Mono']
const ZOOM_OPTIONS = [0.85, 0.95, 1, 1.1, 1.2]

function applyHover(element: HTMLButtonElement) {
  element.style.background = '#f5f5f5'
  element.style.color = '#0a0a0a'
}

function resetHover(element: HTMLButtonElement) {
  element.style.background = 'transparent'
  element.style.color = '#737373'
}

const RESIZE_HANDLES: Array<{
  direction: ResizeDirection
  cursor: React.CSSProperties['cursor']
  style: React.CSSProperties
}> = [
  { direction: 'n', cursor: 'ns-resize', style: { top: -4, left: 12, right: 12, height: 8 } },
  { direction: 'e', cursor: 'ew-resize', style: { top: 12, right: -4, bottom: 12, width: 8 } },
  { direction: 's', cursor: 'ns-resize', style: { bottom: -4, left: 12, right: 12, height: 8 } },
  { direction: 'w', cursor: 'ew-resize', style: { top: 12, left: -4, bottom: 12, width: 8 } },
  { direction: 'ne', cursor: 'nesw-resize', style: { top: -4, right: -4, width: 12, height: 12 } },
  { direction: 'nw', cursor: 'nwse-resize', style: { top: -4, left: -4, width: 12, height: 12 } },
  { direction: 'se', cursor: 'nwse-resize', style: { bottom: -4, right: -4, width: 12, height: 12 } },
  { direction: 'sw', cursor: 'nesw-resize', style: { bottom: -4, left: -4, width: 12, height: 12 } },
]