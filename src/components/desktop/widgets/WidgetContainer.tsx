import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GripVertical, Lock, Unlock, X } from 'lucide-react'
import type { PlacedWidget } from '@/types'
import { ClockUptimeWidget } from './ClockUptimeWidget'
import { SystemVitalWidget } from './SystemVitalWidget'
import { NetworkTrafficWidget } from './NetworkTrafficWidget'
import { QuickNoteWidget } from './QuickNoteWidget'

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

    // Only left click
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
      const clampedX = Math.max(12, Math.min(screenW - 292, newX))
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
      onUpdatePosition(widget.id, latestX, latestY)
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
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className={`group pointer-events-auto rounded-xl border bg-slate-950/85 backdrop-blur-md shadow-xl transition-shadow select-none ${
        widget.isLocked
          ? 'cursor-default border-slate-800/80'
          : isDragging
          ? 'cursor-grabbing border-cyan-500/80 shadow-2xl shadow-cyan-500/10 ring-1 ring-cyan-500/30'
          : 'cursor-grab border-slate-800/80 hover:border-slate-700/90'
      }`}
    >
      {/* Widget Control Header (revealed on hover) */}
      <div className="flex items-center justify-between border-b border-slate-850 px-2.5 py-1 text-slate-400 opacity-60 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
          {!widget.isLocked && (
            <GripVertical size={11} className="text-slate-400" />
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
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            {widget.isLocked ? <Lock size={11} className="text-amber-400" /> : <Unlock size={11} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(widget.id)
            }}
            title="Hapus widget dari desktop"
            className="rounded p-1 text-slate-400 hover:bg-red-950/60 hover:text-red-400"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Widget Body */}
      <Component />
    </motion.div>
  )
}
