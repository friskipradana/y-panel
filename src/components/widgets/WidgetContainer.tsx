import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GripVertical, Lock, Unlock, X } from 'lucide-react'
import type { PlacedWidget } from '@/types'
import { snapWidgetPosition, useWidgetStore, WIDGET_HEIGHTS, WIDGET_WIDTH } from '@/store/widgetStore'
import { alertLib } from '@/lib/alert'
import { ClockUptimeWidget } from './ClockUptimeWidget'
import { SystemVitalWidget } from './SystemVitalWidget'
import { NetworkTrafficWidget } from './NetworkTrafficWidget'
import { QuickNoteWidget } from './QuickNoteWidget'
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

const WIDGET_COMPONENTS: Record<PlacedWidget['type'], React.ComponentType<WidgetProps>> = {
  'clock-uptime': ClockUptimeWidget,
  'system-vital': SystemVitalWidget,
  'network-traffic': NetworkTrafficWidget,
  'quick-note': QuickNoteWidget,
  'cpu-graph': CpuGraphWidget,
  ping: PingWidget,
}

const WIDGET_META: Record<PlacedWidget['type'], { title: string }> = {
  'clock-uptime': { title: 'Clock & Uptime' },
  'system-vital': { title: 'System Vitals' },
  'network-traffic': { title: 'Network Traffic' },
  'quick-note': { title: 'Sticky Note' },
  'cpu-graph': { title: 'CPU History' },
  ping: { title: 'Ping Monitor' },
}

const EDGE = 12
const TOP_MIN = 64 // below the taskbar, leaves room for the hover title

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

// Chrome (title, grip, lock, close) only appears on hover/focus; touch devices always show it
const CHROME_VISIBILITY =
  'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'

export function WidgetContainer({ widget, onUpdatePosition, onRemove, onToggleLock }: WidgetContainerProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const viewport = useViewport()
  const Component = WIDGET_COMPONENTS[widget.type]
  const meta = WIDGET_META[widget.type] || { title: widget.type }
  const title =
    widget.type === 'ping'
      ? `Ping · ${String(widget.config?.label || widget.config?.host || '')}`.trim()
      : meta.title

  // Width follows the viewport on narrow screens; position is kept inside it
  const width = Math.min(WIDGET_WIDTH, viewport.w - EDGE * 2)
  const height = WIDGET_HEIGHTS[widget.type] || 165
  const left = Math.max(EDGE, Math.min(widget.x, viewport.w - width - EDGE))
  const top = Math.max(TOP_MIN, Math.min(widget.y, viewport.h - height - 24))

  const isNote = widget.type === 'quick-note'
  const background = isNote ? noteBackground(asNoteColor(widget.config?.color)) : 'var(--widget-bg)'

  const handleRemove = async () => {
    const text = typeof widget.config?.text === 'string' ? widget.config.text.trim() : ''
    if (isNote && text) {
      const ok = await alertLib.confirm(t('widget.note.deleteTitle'), t('widget.note.deleteConfirm'), t('common.delete'), t('common.cancel'))
      if (!ok) return
    }
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
      const minSafeX = window.innerWidth < 640 ? EDGE : 200
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

      const allWidgets = useWidgetStore.getState().placedWidgets
      const snapped = snapWidgetPosition(widget.id, widget.type, latestX, latestY, allWidgets)

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
        minHeight: height,
        background,
        color: 'var(--win-text)',
        boxShadow: isDragging ? 'var(--widget-shadow-hover)' : 'var(--widget-shadow)',
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className={`group @container pointer-events-auto flex select-none flex-col rounded-xl border backdrop-blur-md transition-[border-color,box-shadow] duration-200 hover:border-[var(--widget-border)] ${
        isDragging ? 'cursor-grabbing border-[var(--widget-border)]' : 'border-transparent'
      } ${widget.isLocked ? 'cursor-default' : isDragging ? '' : 'cursor-grab'}`}
    >
      {/* Hover chrome: floats on the top edge so it never shifts content */}
      <div className={`pointer-events-none absolute -top-4 left-1 right-1 flex items-center justify-between ${CHROME_VISIBILITY}`}>
        <span className="flex min-w-0 items-center gap-1 text-[0.75rem] font-medium text-[var(--win-text)]" style={{ textShadow: '0 1px 3px var(--widget-border)' }}>
          {!widget.isLocked ? <GripVertical size={11} className="shrink-0 opacity-60" /> : null}
          <span className="truncate">{title}</span>
        </span>
        <div
          className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-md border px-0.5 text-[var(--text-secondary)] backdrop-blur-md"
          style={{ backgroundColor: 'var(--widget-bg)', borderColor: 'var(--widget-border)' }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleLock(widget.id)
            }}
            title={widget.isLocked ? t('widget.unlock') : t('widget.lock')}
            aria-label={widget.isLocked ? t('widget.unlock') : t('widget.lock')}
            aria-pressed={!!widget.isLocked}
            className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]"
          >
            {widget.isLocked ? <Lock size={11} className="text-[var(--panel-warning-text)]" /> : <Unlock size={11} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void handleRemove()
            }}
            title={t('widget.remove')}
            aria-label={t('widget.remove')}
            className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--panel-danger-bg)] hover:text-[var(--panel-danger-text)]"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <Component widget={widget} />
      </div>
    </motion.div>
  )
}
