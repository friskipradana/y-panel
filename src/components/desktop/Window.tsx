import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Maximize, Minimize as ExitFullscreen, Minus, Square, X } from 'lucide-react'
import { useWindowStore, selectFocusedId, selectGlobalContentZoom, selectGlobalFontIndex, selectGlobalTerminalFontSize } from '@/store/windowStore'
import { useAlertStore } from '@/store/alertStore'
import { InnerAlert } from '@/components/alert/GlobalAlert'
import type { WindowState } from '@/types'

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface Props {
  win: WindowState
  children: React.ReactNode
}

const TOP_SAFE_OFFSET = 44
const BOTTOM_SAFE_OFFSET = 96
const VIEWPORT_PADDING = 8
const WINDOW_GRAB_VISIBILITY = 180

export function Window({ win, children }: Props) {
  const {
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    toggleFullscreenWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
    setGlobalContentZoom,
    setGlobalFontIndex,
    setGlobalTerminalFontSize,
  } = useWindowStore()
  const dragRef = useRef<{ ox: number; oy: number } | null>(null)
  const [textAccent, setTextAccent] = useState({ bold: false, italic: false, underline: false })

  const focusedId = useWindowStore(selectFocusedId)
  const globalContentZoom = useWindowStore(selectGlobalContentZoom)
  const globalFontIndex = useWindowStore(selectGlobalFontIndex)
  const globalTerminalFontSize = useWindowStore(selectGlobalTerminalFontSize)
  const isFocused = win.id === focusedId

  const alertState = useAlertStore()
  const isTargetAlert = alertState.isOpen && alertState.data?.windowId === win.kind

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
      const nextX = ev.clientX - dragRef.current.ox
      const nextY = ev.clientY - dragRef.current.oy
      const minX = VIEWPORT_PADDING - (win.width - WINDOW_GRAB_VISIBILITY)
      const maxX = window.innerWidth - WINDOW_GRAB_VISIBILITY - VIEWPORT_PADDING
      const minY = TOP_SAFE_OFFSET
      const maxY = window.innerHeight - BOTTOM_SAFE_OFFSET
      moveWindow(
        win.id,
        Math.min(Math.max(nextX, minX), maxX),
        Math.min(Math.max(nextY, minY), maxY),
      )
    }
    const onUp = () => {
      dragRef.current = null
      const currentWindow = useWindowStore.getState().windows.find((w) => w.id === win.id)
      if (currentWindow) {
        const minX = VIEWPORT_PADDING - (currentWindow.width - WINDOW_GRAB_VISIBILITY)
        const maxX = window.innerWidth - WINDOW_GRAB_VISIBILITY - VIEWPORT_PADDING
        const minY = TOP_SAFE_OFFSET
        const maxY = window.innerHeight - BOTTOM_SAFE_OFFSET
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
    const minLeft = VIEWPORT_PADDING - (initial.width - WINDOW_GRAB_VISIBILITY)
    const maxRight = window.innerWidth - VIEWPORT_PADDING
    const maxBottom = window.innerHeight - BOTTOM_SAFE_OFFSET

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
        const candidateX = Math.min(initial.x + initial.width - minWidth, Math.max(minLeft, initial.x + deltaX))
        nextX = candidateX
        nextWidth = Math.max(minWidth, initial.width + (initial.x - candidateX))
      }
      if (direction.includes('n')) {
        const candidateY = Math.min(initial.y + initial.height - minHeight, Math.max(TOP_SAFE_OFFSET, initial.y + deltaY))
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

  const contentFontFamily = FONT_OPTIONS[globalFontIndex] ?? FONT_OPTIONS[0]
  const contentZoom = globalContentZoom
  const isExpanded = win.isMaximized || win.isFullscreen

  const style = win.isFullscreen
    ? { left: 0, top: 0, width: '100vw', height: '100vh', zIndex: win.zIndex }
    : win.isMaximized
      ? { left: 0, top: TOP_SAFE_OFFSET, width: '100vw', height: `calc(100vh - ${TOP_SAFE_OFFSET}px)`, zIndex: win.zIndex }
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
            background: 'var(--win-bg)',
            borderRadius: isExpanded ? 0 : 24,
            border: isExpanded ? 'none' : `1px solid ${isFocused ? 'var(--win-border-focus)' : 'var(--win-border)'}`,
            boxShadow: isExpanded
              ? 'none'
              : isFocused
                ? 'var(--win-shadow-focus)'
                : 'var(--win-shadow)',
            transition: 'box-shadow 200ms ease, border-color 200ms ease, border-radius 200ms ease',
            backdropFilter: 'blur(22px)',
          }}
          onMouseDown={() => focusWindow(win.id)}
        >
          <div
            style={{
              height: 46,
              background: isFocused ? 'var(--win-bar-focus)' : 'var(--win-bar)',
              borderBottom: isExpanded ? 'none' : '1px solid var(--win-bar-border)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              cursor: isExpanded ? 'default' : 'move',
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
                  color: isFocused ? 'var(--win-text)' : '#94a3b8',
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
                title={win.isMaximized ? 'Restore window' : 'Fill workspace'}
              >
                <Square size={12} strokeWidth={1.5} />
              </button>

              <button
                onClick={() => toggleFullscreenWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => applyHover(e.currentTarget)}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
                title={win.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {win.isFullscreen ? <ExitFullscreen size={12} strokeWidth={1.8} /> : <Maximize size={12} strokeWidth={1.8} />}
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

          {!win.isFullscreen && (
            <div
              style={{
                minHeight: 42,
                background: 'rgba(250,250,250,0.76)',
                borderBottom: '1px solid rgba(240,240,240,0.82)',
                display: 'flex',
                alignItems: 'center',
                padding: '6px 10px',
                gap: 8,
                flexShrink: 0,
                flexWrap: 'wrap',
              }}
            >
              <div style={toolbarToolsGroupStyle}>
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
              </div>

              <div style={toolbarToolsGroupStyle}>
                <button
                  type="button"
                  style={toolbarChipStyle}
                  onClick={() => setGlobalFontIndex((globalFontIndex + 1) % FONT_OPTIONS.length)}
                >
                  Font · {FONT_LABELS[globalFontIndex]}
                </button>
                <button
                  type="button"
                  style={toolbarValueChipStyle}
                  onClick={() => setGlobalFontIndex((globalFontIndex + 1) % FONT_OPTIONS.length)}
                >
                  Family {globalFontIndex + 1}/{FONT_OPTIONS.length}
                </button>
              </div>

              <div style={toolbarToolsGroupStyle}>
                <button
                  type="button"
                  style={toolbarChipStyle}
                  onClick={() => setGlobalContentZoom(Math.min(2, globalContentZoom + 0.05))}
                >
                  Zoom · {contentZoom.toFixed(2)}x
                </button>
                <button
                  type="button"
                  style={toolbarValueChipStyle}
                  onClick={() => setGlobalContentZoom(Math.max(0.75, globalContentZoom - 0.05))}
                >
                  −
                </button>
                <button
                  type="button"
                  style={toolbarValueChipStyle}
                  onClick={() => setGlobalContentZoom(Math.min(2, globalContentZoom + 0.05))}
                >
                  +
                </button>
              </div>

              {win.kind === 'host-terminal' && (
                <div style={toolbarToolsGroupStyle}>
                  <button
                    type="button"
                    style={toolbarChipStyle}
                    onClick={() => setGlobalTerminalFontSize(globalTerminalFontSize - 1)}
                  >
                    Terminal · {globalTerminalFontSize}px
                  </button>
                  <button
                    type="button"
                    style={toolbarValueChipStyle}
                    onClick={() => setGlobalTerminalFontSize(globalTerminalFontSize - 1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    style={toolbarValueChipStyle}
                    onClick={() => setGlobalTerminalFontSize(globalTerminalFontSize + 1)}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', zIndex: 1 }}>
            <div
              style={{
                flex: 1,
                overflow: (win.kind === 'host-terminal' || win.kind === 'system-logs') ? 'hidden' : 'auto',
                padding: win.isFullscreen
                  ? 0
                  : (win.kind === 'host-terminal' || win.kind === 'system-logs')
                    ? 0
                    : win.kind === 'system'
                      ? '16px 16px 20px'
                      : win.kind === 'docs'
                        ? '14px 14px 18px'
                        : '16px 16px 20px',
                fontSize: 12,
                color: 'var(--win-text)',
                lineHeight: 1.65,
                background: win.isFullscreen ? 'var(--win-bg)' : 'var(--win-content-bg)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <div
                style={{
                  minHeight: '100%',
                  height: (win.kind === 'host-terminal' || win.kind === 'system-logs') ? '100%' : undefined,
                  display: (win.kind === 'host-terminal' || win.kind === 'system-logs') ? 'flex' : undefined,
                  flexDirection: (win.kind === 'host-terminal' || win.kind === 'system-logs') ? 'column' : undefined,
                  fontFamily: contentFontFamily,
                  fontWeight: textAccent.bold ? 600 : 400,
                  fontStyle: textAccent.italic ? 'italic' : 'normal',
                  textDecoration: textAccent.underline ? 'underline' : 'none',
                  zoom: (win.kind === 'host-terminal' || win.kind === 'system-logs') ? 1 : contentZoom,
                  transformOrigin: 'top left',
                }}
              >
                {children}
              </div>
            </div>

            <AnimatePresence>
              {isTargetAlert && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center overflow-hidden">
                  <InnerAlert data={alertState.data} closeDialog={alertState.closeDialog} />
                </div>
              )}
            </AnimatePresence>
          </div>

          {!isExpanded && RESIZE_HANDLES.map((handle) => (
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
  width: 24,
  height: 24,
  border: 'none',
  background: 'transparent',
  borderRadius: 6,
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

const toolbarToolsGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  paddingRight: 8,
  marginRight: 2,
  borderRight: '1px solid rgba(229,229,229,0.9)',
  flexWrap: 'wrap',
  minHeight: 24,
}

const toolbarChipStyle: React.CSSProperties = {
  minHeight: 24,
  fontSize: 10,
  lineHeight: 1.1,
  color: '#64748b',
  padding: '3px 8px',
  border: '1px solid #e5e5e5',
  borderRadius: 999,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.85)',
  whiteSpace: 'nowrap',
}

const toolbarValueChipStyle: React.CSSProperties = {
  minWidth: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  color: '#475569',
  padding: '0 7px',
  border: '1px solid #e5e5e5',
  borderRadius: 999,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.92)',
  whiteSpace: 'nowrap',
}

const FONT_OPTIONS = [
  'Outfit, system-ui, sans-serif',
  'Inter, Outfit, system-ui, sans-serif',
  '"JetBrains Mono", monospace',
]

const FONT_LABELS = ['Outfit', 'Inter', 'Mono']

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