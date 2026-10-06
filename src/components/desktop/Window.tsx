import { useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Maximize, Minimize as ExitFullscreen, Minus, Square, X } from 'lucide-react'
import { useWindowStore, selectFocusedId } from '@/store/windowStore'
import { useAlertStore } from '@/store/alertStore'
import { InnerAlert } from '@/components/alert/GlobalAlert'
import { AppIcon } from '@/components/common/AppIcon'
import type { WindowState } from '@/types'
import { useI18n, windowTitleKey } from '@/lib/i18n'

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
  const { t } = useI18n()
  const {
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    toggleFullscreenWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
  } = useWindowStore()
  const windowRef = useRef<HTMLDivElement>(null)

  const focusedId = useWindowStore(selectFocusedId)
  const isFocused = win.id === focusedId

  const alertState = useAlertStore()
  const isTargetAlert = alertState.isOpen && alertState.data?.windowId === win.kind

  const animation = useMemo(() => {
    if (win.lastAction === 'restore') {
      return {
        initial: { scale: 0.92, opacity: 0, y: 20 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: 0.92, opacity: 0, y: 20 },
      }
    }

    if (win.lastAction === 'minimize') {
      return {
        initial: { scale: 1, opacity: 1, y: 0 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: 0.88, opacity: 0, y: 40 },
      }
    }

    return {
      initial: { scale: 0.96, opacity: 0, y: 8 },
      animate: { scale: 1, opacity: 1, y: 0 },
      exit: { scale: 0.96, opacity: 0, y: 8 },
    }
  }, [win.lastAction])

  const handleBarMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    focusWindow(win.id)
    if (win.isMaximized || win.isFullscreen) return

    const startClientX = e.clientX
    const startClientY = e.clientY
    const startWinX = win.x
    const startWinY = win.y
    let curX = startWinX
    let curY = startWinY
    let rafId: number | null = null

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'move'

    const onMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startClientX
      const deltaY = ev.clientY - startClientY
      const nextX = startWinX + deltaX
      const nextY = startWinY + deltaY
      const minX = VIEWPORT_PADDING - (win.width - WINDOW_GRAB_VISIBILITY)
      const maxX = window.innerWidth - WINDOW_GRAB_VISIBILITY - VIEWPORT_PADDING
      const minY = TOP_SAFE_OFFSET
      const maxY = window.innerHeight - BOTTOM_SAFE_OFFSET
      curX = Math.min(Math.max(nextX, minX), maxX)
      curY = Math.min(Math.max(nextY, minY), maxY)

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          if (windowRef.current) {
            windowRef.current.style.left = `${curX}px`
            windowRef.current.style.top = `${curY}px`
          }
        })
      }
    }

    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      moveWindow(win.id, curX, curY)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseup', onUp)
  }

  const handleResizeStart = (direction: ResizeDirection, event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    focusWindow(win.id)
    if (win.isMaximized || win.isFullscreen) return

    const startX = event.clientX
    const startY = event.clientY
    const initial = { x: win.x, y: win.y, width: win.width, height: win.height }
    const minWidth = win.kind === 'host-terminal' ? 480 : win.kind === 'system' ? 360 : 300
    const minHeight = win.kind === 'host-terminal' ? 320 : win.kind === 'system' ? 360 : 220

    let curX = initial.x
    let curY = initial.y
    let curWidth = initial.width
    let curHeight = initial.height
    let rafId: number | null = null

    document.body.style.userSelect = 'none'

    const onMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      let nextX = initial.x
      let nextY = initial.y
      let nextWidth = initial.width
      let nextHeight = initial.height

      if (direction.includes('e')) {
        nextWidth = Math.max(minWidth, initial.width + deltaX)
      }
      if (direction.includes('s')) {
        nextHeight = Math.max(minHeight, initial.height + deltaY)
      }
      if (direction.includes('w')) {
        const candidateX = Math.min(initial.x + initial.width - minWidth, initial.x + deltaX)
        nextX = candidateX
        nextWidth = Math.max(minWidth, initial.width + (initial.x - candidateX))
      }
      if (direction.includes('n')) {
        const candidateY = Math.min(initial.y + initial.height - minHeight, Math.max(TOP_SAFE_OFFSET, initial.y + deltaY))
        nextY = candidateY
        nextHeight = Math.max(minHeight, initial.height + (initial.y - candidateY))
      }

      curX = nextX
      curY = nextY
      curWidth = nextWidth
      curHeight = nextHeight

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          if (windowRef.current) {
            windowRef.current.style.left = `${curX}px`
            windowRef.current.style.top = `${curY}px`
            windowRef.current.style.width = `${curWidth}px`
            windowRef.current.style.height = `${curHeight}px`
          }
        })
      }
    }

    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      moveWindow(win.id, curX, curY)
      resizeWindow(win.id, curWidth, curHeight)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseup', onUp)
  }

  const isExpanded = win.isMaximized || win.isFullscreen

  const style = win.isFullscreen
    ? { left: 0, top: 0, width: '100vw', height: '100vh', zIndex: win.zIndex }
    : win.isMaximized
      ? { left: 0, top: TOP_SAFE_OFFSET, width: '100vw', height: `calc(100vh - ${TOP_SAFE_OFFSET}px)`, zIndex: win.zIndex }
      : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex }

  return (
    <motion.div
      ref={windowRef}
      key={win.id}
      initial={animation.initial}
      animate={{
        scale: win.isMinimized ? 0.88 : 1,
        opacity: win.isMinimized ? 0 : 1,
        y: win.isMinimized ? 40 : 0,
        filter: isFocused ? 'brightness(1)' : 'brightness(0.975)',
        pointerEvents: win.isMinimized ? 'none' : 'auto',
      }}
      exit={animation.exit}
      transition={{
        duration: 0.15,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="absolute flex flex-col overflow-hidden select-none pointer-events-auto"
      style={{
        ...style,
        background: 'var(--win-bg)',
        borderRadius: isExpanded ? 0 : 14,
        border: isExpanded ? 'none' : `1px solid ${isFocused ? 'var(--win-border-focus)' : 'var(--win-border)'}`,
        boxShadow: isExpanded
          ? 'none'
          : isFocused
            ? 'var(--win-shadow-focus)'
            : 'var(--win-shadow)',
        transition: 'box-shadow 200ms ease, border-color 200ms ease, border-radius 200ms ease',
        backdropFilter: 'blur(20px)',
      }}
      onMouseDown={() => focusWindow(win.id)}
    >
          {/* Window Titlebar */}
          <div
            className="flex items-center justify-between px-3 shrink-0 relative z-10 transition-colors duration-150 select-none border-b border-[var(--win-border)]"
            style={{
              height: 38,
              background: isFocused ? 'var(--win-bar-focus)' : 'var(--win-bar)',
              borderBottom: '1px solid var(--win-border)',
              cursor: isExpanded ? 'default' : 'move',
            }}
            onMouseDown={handleBarMouseDown}
            onDoubleClick={() => maximizeWindow(win.id)}
          >
            {/* Window Icon & Title (Left-aligned) */}
            <div className="flex items-center gap-2 min-w-0 pr-3 pointer-events-none">
              <AppIcon kind={win.kind} size={16} />
              <span
                className="text-xs font-semibold truncate tracking-tight transition-colors duration-150"
                style={{
                  color: isFocused ? 'var(--win-text)' : 'var(--window-title-muted)',
                }}
              >
                {t(windowTitleKey(win.kind))}
              </span>
            </div>

            {/* Window Action Controls (Right-aligned) */}
            <div
              className="flex items-center gap-1 shrink-0"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => minimizeWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => applyHover(e.currentTarget)}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
                title="Minimize"
              >
                <Minus size={13} strokeWidth={1.75} />
              </button>

              <button
                type="button"
                onClick={() => maximizeWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => applyHover(e.currentTarget)}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
                title={win.isMaximized ? 'Restore' : 'Maximize'}
              >
                {win.isMaximized ? (
                  <Copy size={11} strokeWidth={1.75} className="rotate-90" />
                ) : (
                  <Square size={11} strokeWidth={1.75} />
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleFullscreenWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => applyHover(e.currentTarget)}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
                title={win.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {win.isFullscreen ? (
                  <ExitFullscreen size={12} strokeWidth={1.75} />
                ) : (
                  <Maximize size={12} strokeWidth={1.75} />
                )}
              </button>

              <button
                type="button"
                onClick={() => closeWindow(win.id)}
                style={controlButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--window-close-hover-bg, #ef4444)'
                  e.currentTarget.style.color = 'var(--window-close-hover-text, #ffffff)'
                }}
                onMouseLeave={(e) => resetHover(e.currentTarget)}
                title="Close"
              >
                <X size={13} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Window Body */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            <div
              style={{
                flex: 1,
                overflow: (win.kind === 'host-terminal' || win.kind === 'system-logs') ? 'hidden' : 'auto',
                fontSize: 13,
                color: 'var(--win-text)',
                lineHeight: 1.5,
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
                }}
              >
                {children}
              </div>
            </div>

            {/* Inner Alert Dialog Modal */}
            <AnimatePresence>
              {isTargetAlert && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center overflow-hidden">
                  <InnerAlert data={alertState.data} closeDialog={alertState.closeDialog} />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Resize Handles */}
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
  )
}

const controlButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  background: 'transparent',
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--tb-clock)',
  transition: 'background 120ms ease, color 120ms ease',
}

function applyHover(element: HTMLButtonElement) {
  element.style.background = 'var(--tb-hover)'
  element.style.color = 'var(--win-text)'
}

function resetHover(element: HTMLButtonElement) {
  element.style.background = 'transparent'
  element.style.color = 'var(--tb-clock)'
}

const RESIZE_HANDLES: Array<{
  direction: ResizeDirection
  cursor: React.CSSProperties['cursor']
  style: React.CSSProperties
}> = [
  { direction: 'n', cursor: 'ns-resize', style: { top: -4, left: 10, right: 10, height: 8 } },
  { direction: 'e', cursor: 'ew-resize', style: { top: 10, right: -4, bottom: 10, width: 8 } },
  { direction: 's', cursor: 'ns-resize', style: { bottom: -4, left: 10, right: 10, height: 8 } },
  { direction: 'w', cursor: 'ew-resize', style: { top: 10, left: -4, bottom: 10, width: 8 } },
  { direction: 'ne', cursor: 'nesw-resize', style: { top: -4, right: -4, width: 12, height: 12 } },
  { direction: 'nw', cursor: 'nwse-resize', style: { top: -4, left: -4, width: 12, height: 12 } },
  { direction: 'se', cursor: 'nwse-resize', style: { bottom: -4, right: -4, width: 12, height: 12 } },
  { direction: 'sw', cursor: 'nesw-resize', style: { bottom: -4, left: -4, width: 12, height: 12 } },
]
