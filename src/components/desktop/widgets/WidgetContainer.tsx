import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GripVertical, Lock, Unlock, X } from 'lucide-react'
import type { PlacedWidget } from '@/types'
import { snapWidgetPosition, useWidgetStore } from '@/store/widgetStore'
import { ClockUptimeWidget } from './ClockUptimeWidget'
import { SystemVitalWidget } from './SystemVitalWidget'
import { NetworkTrafficWidget } from './NetworkTrafficWidget'
import { QuickNoteWidget } from './QuickNoteWidget'
import { CpuGraphWidget } from './CpuGraphWidget'

interface WidgetContainerProps {
  widget: PlacedWidget
  onUpdatePosition: (id: string, x: number, y: number) => void
  onRemove: (id: string) => void
  onToggleLock: (id: string) => void
}

const WIDGET_COMPONENTS: Record<PlacedWidget['type'], React.ComponentType> = {
  'clock-uptime': ClockUptimeWidget,
  'system-vital': SystemVitalWidget,
  'network-traffic': NetworkTrafficWidget,
  'quick-note': QuickNoteWidget,
  'cpu-graph': CpuGraphWidget,
}

export function WidgetContainer({
  widget,
  onUpdatePosition,
  onRemove,
  onToggleLock,
}: WidgetContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const Component = WIDGET_COMPONENTS[widget.type]

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (widget.isLocked) return

    // Do not initiate drag if user is clicking on interactive elements (buttons, textarea, input)
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('textarea') || target.closest('input')) {
      return
    }

    if (e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()

    setIsDragging(true)
    const startX = e.clientX
    const startY = e.clientY
    const startWidgetX = widget.x
    const startWidgetY = widget.y

    let latestX = startWidgetX
    let latestY = startWidgetY

    const onPointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX
      const deltaY = ev.clientY - startY
      const newX = startWidgetX + deltaX
      const newY = startWidgetY + deltaY

      const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280
      const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
      const minSafeX = screenW < 640 ? 12 : 200
      const clampedX = Math.max(minSafeX, Math.min(screenW - 292, newX))
      const clampedY = Math.max(48, Math.min(screenH - 120, newY))

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
        left: widget.x,
        top: widget.y,
        width: 280,
        height: 195,
        backgroundColor: 'var(--widget-bg)',
        borderColor: 'var(--widget-border)',
        color: 'var(--win-text)',
        boxShadow: isDragging ? 'var(--widget-shadow-hover)' : 'var(--widget-shadow)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className={`group pointer-events-auto rounded-xl border backdrop-blur-md select-none flex flex-col justify-between overflow-hidden ${
        widget.isLocked
          ? 'cursor-default'
          : isDragging
          ? 'cursor-grabbing ring-1 ring-cyan-500/40'
          : 'cursor-grab hover:border-cyan-500/35'
      }`}
    >
      {/* Widget Control Header (revealed on hover) */}
      <div
        className="flex items-center justify-between border-b px-2.5 py-1 text-[11px] opacity-60 transition-opacity group-hover:opacity-100 shrink-0"
        style={{ borderColor: 'var(--widget-border)', color: 'var(--text-secondary)' }}
      >
        <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider">
          {!widget.isLocked && (
            <GripVertical size={11} />
          )}
          <span>{widget.type.replace('-', ' ')}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleLock(widget.id)
            }}
            title={widget.isLocked ? 'Buka kunci posisi' : 'Kunci posisi widget'}
            className="rounded p-1 transition-colors hover:bg-slate-500/15"
            style={{ color: 'var(--text-secondary)' }}
          >
            {widget.isLocked ? <Lock size={11} className="text-amber-500" /> : <Unlock size={11} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(widget.id)
            }}
            title="Hapus widget dari desktop"
            className="rounded p-1 transition-colors hover:bg-red-500/15 hover:text-red-500"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Widget Body */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden">
        <Component />
      </div>
    </motion.div>
  )
}
