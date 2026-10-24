import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GripVertical, Lock, Unlock, X } from 'lucide-react'
import type { PlacedWidget } from '@/types'
import {
  forgetWidgetHeight,
  placeDroppedWidget,
  widgetsAreFree,
  reportWidgetHeight,
  scheduleLayoutSettle,
  useWidgetStore,
  widgetHeightOf,
  widgetWidthOf,
  WIDGET_HEIGHTS,
  WIDGET_MAX_HEIGHT,
  WIDGET_MAX_WIDTH,
  WIDGET_MIN_HEIGHT,
  WIDGET_MIN_WIDTH,
  WIDGET_TOP,
  WIDGET_WIDTH,
} from '@/store/widgetStore'
import { ClockUptimeWidget } from './ClockUptimeWidget'
import { SystemVitalWidget } from './SystemVitalWidget'
import { NetworkTrafficWidget } from './NetworkTrafficWidget'
import { NoteHeaderActions, QuickNoteWidget } from './QuickNoteWidget'
import { CpuGraphWidget } from './CpuGraphWidget'
import { PingWidget } from './PingWidget'
import { asNoteColor, noteBackground } from './noteColors'
import type { WidgetProps } from './types'
import { useI18n } from '@/lib/i18n'

interface WidgetContainerProps {
  widget: PlacedWidget
  onUpdatePosition: (id: string, x: number, y: number) => void
  onRemove: (id: string) => void
  onToggleLock: (id: string) => void
}

export const WIDGET_COMPONENTS: Record<PlacedWidget['type'], React.ComponentType<WidgetProps>> = {
  'clock-uptime': ClockUptimeWidget,
  'system-vital': SystemVitalWidget,
  'network-traffic': NetworkTrafficWidget,
  'quick-note': QuickNoteWidget,
  'cpu-graph': CpuGraphWidget,
  ping: PingWidget,
}

// Text and charts grow and shrink with the width of the card (1 = the design width)
function contentScale(width: number) {
  return Math.round(Math.min(2.6, Math.max(0.7, width / WIDGET_WIDTH)) * 1000) / 1000
}

const EDGE = 12
const TOP_MIN = WIDGET_TOP // below the taskbar

// Resize handles, like the window frame: edges and corners
type HandleDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: Array<{ dir: HandleDir; className: string }> = [
  { dir: 'n', className: 'left-2 right-2 top-0 h-1.5 cursor-ns-resize' },
  { dir: 's', className: 'bottom-0 left-2 right-2 h-1.5 cursor-ns-resize' },
  { dir: 'e', className: 'bottom-2 right-0 top-2 w-1.5 cursor-ew-resize' },
  { dir: 'w', className: 'bottom-2 left-0 top-2 w-1.5 cursor-ew-resize' },
  { dir: 'ne', className: 'right-0 top-0 h-3 w-3 cursor-nesw-resize' },
  { dir: 'nw', className: 'left-0 top-0 h-3 w-3 cursor-nwse-resize' },
  { dir: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize' },
  { dir: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize' },
]

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export function WidgetContainer({ widget, onUpdatePosition, onRemove, onToggleLock }: WidgetContainerProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const viewport = useViewport()
  const Component = WIDGET_COMPONENTS[widget.type]
  // a sticky note is named by its first line, and by the widget name while it is empty
  const noteTitle = useWidgetStore((s) =>
    widget.type === 'quick-note' ? (s.notes.find((n) => n.id === widget.config?.noteId)?.text.split('\n').find((l) => l.trim())?.trim() ?? '') : '',
  )
  const title =
    widget.type === 'ping'
      ? `Ping · ${String(widget.config?.label || widget.config?.host || '')}`.trim()
      : noteTitle || t(`widget.catalog.${widget.type}.title`)

  // Report the resting height (card minus the hover header) so layout uses real sizes
  useEffect(() => {
    const card = containerRef.current
    if (!card || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const header = headerRef.current?.offsetHeight ?? 0
      if (reportWidgetHeight(widget.id, card.offsetHeight - header)) scheduleLayoutSettle()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(card)
    return () => {
      observer.disconnect()
      forgetWidgetHeight(widget.id)
    }
  }, [widget.id])

  // Width follows the viewport on narrow screens; position is kept inside it
  const width = Math.min(widgetWidthOf(widget), viewport.w - EDGE * 2)
  const height = widgetHeightOf(widget)
  const resizeWidget = useWidgetStore((s) => s.resizeWidget)
  const left = Math.max(EDGE, Math.min(widget.x, viewport.w - width - EDGE))
  const top = Math.max(TOP_MIN, Math.min(widget.y, viewport.h - height - 24))

  const isNote = widget.type === 'quick-note'
  const noteColor = useWidgetStore((s) => (isNote ? s.notes.find((n) => n.id === widget.config?.noteId)?.color : undefined))
  const background = isNote ? noteBackground(asNoteColor(noteColor)) : 'var(--widget-bg)'

  // closing a sticky note only takes it off the desktop: its text stays in the list
  const handleRemove = () => {
    if (widget.isLocked) return
    onRemove(widget.id)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (widget.isLocked) return

    // Do not initiate drag when interacting with controls, text fields, or charts
    const target = e.target as HTMLElement
    if (target.closest('button, textarea, input, select, svg[role="img"]')) return
    if (e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()

    setIsDragging(true)
    const startX = e.clientX
    const startY = e.clientY
    const startWidgetX = left
    const startWidgetY = top

    let latestX = startWidgetX
    let latestY = startWidgetY

    const onPointerMove = (ev: PointerEvent) => {
      const newX = startWidgetX + ev.clientX - startX
      const newY = startWidgetY + ev.clientY - startY
      // the strip of the icons is only kept clear when placement is not free
      const minSafeX = widgetsAreFree() ? 0 : window.innerWidth < 640 ? EDGE : 200
      const maxX = Math.max(minSafeX, window.innerWidth - width - EDGE)
      const clampedX = Math.max(minSafeX, Math.min(maxX, newX))
      const clampedY = Math.max(TOP_MIN, Math.min(window.innerHeight - height - 24, newY))

      latestX = clampedX
      latestY = clampedY

      if (containerRef.current) {
        containerRef.current.style.left = `${clampedX}px`
        containerRef.current.style.top = `${clampedY}px`
      }
    }

    const onPointerUp = () => {
      setIsDragging(false)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)

      // light alignment, the smallest move out of an overlap, or back to where it was picked up
      const allWidgets = useWidgetStore.getState().placedWidgets
      const snapped = placeDroppedWidget(widget.id, widget.type, latestX, latestY, allWidgets, { x: widget.x, y: widget.y })

      if (containerRef.current) {
        containerRef.current.style.left = `${snapped.x}px`
        containerRef.current.style.top = `${snapped.y}px`
      }

      onUpdatePosition(widget.id, snapped.x, snapped.y)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  const handleResizeStart = (dir: HandleDir, e: React.PointerEvent<HTMLDivElement>) => {
    if (widget.isLocked || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const card = containerRef.current
    const body = bodyRef.current
    if (!card) return

    const start = { x: e.clientX, y: e.clientY, left, top, w: width, h: height }
    const others = useWidgetStore.getState().placedWidgets.filter((w) => w.id !== widget.id)
    let rect = { x: left, y: top, w: width, h: height }
    setIsDragging(true)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      let { left: nx, top: ny, w: nw, h: nh } = start
      if (dir.includes('e')) nw = start.w + dx
      if (dir.includes('s')) nh = start.h + dy
      if (dir.includes('w')) {
        nw = start.w - dx
        nx = start.left + dx
      }
      if (dir.includes('n')) {
        nh = start.h - dy
        ny = start.top + dy
      }
      // sizes stay inside the limits; the edge opposite the handle holds still
      const cw = Math.min(WIDGET_MAX_WIDTH, Math.max(WIDGET_MIN_WIDTH, nw))
      const ch = Math.min(WIDGET_MAX_HEIGHT, Math.max(WIDGET_MIN_HEIGHT, nh))
      if (dir.includes('w')) nx = start.left + (start.w - cw)
      if (dir.includes('n')) ny = start.top + (start.h - ch)
      nx = Math.max(EDGE, Math.min(nx, viewport.w - cw - EDGE))
      ny = Math.max(TOP_MIN, ny)
      rect = { x: nx, y: ny, w: cw, h: ch }
      card.style.left = `${nx}px`
      card.style.top = `${ny}px`
      card.style.width = `${cw}px`
      if (body) body.style.height = `${ch}px`
      card.style.setProperty('--ws', String(contentScale(cw)))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setIsDragging(false)
      // a size that would land on another widget is refused: the card returns to its old size
      const overlaps = !widgetsAreFree() && others.some(
        (o) =>
          rect.x < o.x + widgetWidthOf(o) + 2 &&
          rect.x + rect.w + 2 > o.x &&
          rect.y < o.y + widgetHeightOf(o) + 2 &&
          rect.y + rect.h + 2 > o.y,
      )
      if (overlaps) {
        card.style.setProperty('--ws', String(contentScale(widget.w ? start.w : WIDGET_WIDTH)))
        card.style.left = `${start.left}px`
        card.style.top = `${start.top}px`
        card.style.width = `${start.w}px`
        if (body) body.style.height = widget.h ? `${widget.h}px` : ''
        return
      }
      resizeWidget(widget.id, rect)
      scheduleLayoutSettle()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  if (!Component) return null

  return (
    <motion.div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        background,
        color: 'var(--win-text)',
        boxShadow: isDragging ? 'var(--widget-shadow-hover)' : 'var(--widget-shadow)',
        // the content is laid out at the design width and zoomed by this factor
        ['--ws' as string]: contentScale(widget.w ? width : WIDGET_WIDTH),
      } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className={`group pointer-events-auto z-0 hover:z-20 focus-within:z-20 flex select-none flex-col rounded-xl border backdrop-blur-md transition-[border-color,box-shadow] duration-200 hover:border-[var(--widget-border)] ${
        isDragging ? 'cursor-grabbing border-[var(--widget-border)]' : 'border-transparent'
      } ${widget.isLocked ? 'cursor-default' : isDragging ? '' : 'cursor-grab'}`}
    >
      {/* Header lives inside the card: collapsed at rest, opens on hover and pushes the content down */}
      <div
        ref={headerRef}
        className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-200 ease-out group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 [@media(hover:none)]:grid-rows-[1fr] [@media(hover:none)]:opacity-100 ${
          isDragging ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex h-7 items-center justify-between gap-2 border-b pl-2.5 pr-1" style={{ borderColor: 'var(--widget-border)' }}>
            <span className="flex min-w-0 items-center gap-1.5 text-[0.75rem] font-medium text-[var(--win-text)]">
              {!widget.isLocked ? <GripVertical size={12} className="shrink-0 text-[var(--text-secondary)]" /> : null}
              <span className="truncate">{title}</span>
            </span>
            <div className="flex shrink-0 items-center text-[var(--text-secondary)]">
              {isNote ? <NoteHeaderActions widgetId={widget.id} /> : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleLock(widget.id)
                }}
                title={widget.isLocked ? t('widget.unlock') : t('widget.lock')}
                aria-label={widget.isLocked ? t('widget.unlock') : t('widget.lock')}
                aria-pressed={!!widget.isLocked}
                className="grid h-6 w-6 cursor-pointer place-items-center rounded-md transition-colors hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]"
              >
                {widget.isLocked ? <Lock size={12} className="text-[var(--panel-warning-text)]" /> : <Unlock size={12} />}
              </button>
              {/* a locked widget cannot be removed from itself: unlock it first */}
              {!widget.isLocked ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove()
                  }}
                  title={t('widget.remove')}
                  aria-label={t('widget.remove')}
                  className="grid h-6 w-6 cursor-pointer place-items-center rounded-md transition-colors hover:bg-[var(--panel-danger-bg)] hover:text-[var(--panel-danger-text)]"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* the body holds the height (set by the user, or the minimum for its type), so the hover header grows the whole card */}
      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1 flex-col"
        style={widget.h ? { height: widget.h, minHeight: WIDGET_MIN_HEIGHT } : { minHeight: WIDGET_HEIGHTS[widget.type] || 165 }}
      >
        <div className={`flex min-h-0 flex-1 flex-col ${widget.h ? 'overflow-hidden' : ''}`} style={{ zoom: 'var(--ws)' }}>
          <div className="@container flex min-h-0 flex-1 flex-col">
            <Component widget={widget} />
          </div>
        </div>
      </div>

      {!widget.isLocked
        ? HANDLES.map((h) => (
            <div
              key={h.dir}
              aria-hidden="true"
              onPointerDown={(e) => handleResizeStart(h.dir, e)}
              className={`absolute z-10 ${h.className}`}
            />
          ))
        : null}
    </motion.div>
  )
}
