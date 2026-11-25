import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { projectWidgetsToViewport, useWidgetStore, widgetAllowedFor } from '@/store/widgetStore'
import { useAuthStore } from '@/store/authStore'
import { WidgetContainer } from './WidgetContainer'
import { useSystemSampler } from '@/hooks/useSystemSampler'
import { useWidgetSync } from '@/hooks/useWidgetSync'

export function DesktopWidgetLayer() {
  const { placedWidgets, layoutViewport, updateWidgetPosition, removeWidget, toggleWidgetLock } = useWidgetStore()
  // Keeps the persisted CPU/RAM/disk/network history growing while the desktop is open
  useSystemSampler()
  // Layout and notes are per account and come from the server; hide until loaded
  const ready = useWidgetSync()
  const role = useAuthStore((s) => s.user?.role)
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => {
    let raf = 0
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        setViewport({ w: window.innerWidth, h: window.innerHeight })
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const visibleWidgets = useMemo(
    () => placedWidgets.filter((w) => widgetAllowedFor(w.type, role)),
    [placedWidgets, role],
  )

  const projected = useMemo(
    () => projectWidgetsToViewport(visibleWidgets, layoutViewport, viewport.w, viewport.h),
    [visibleWidgets, layoutViewport, viewport.w, viewport.h],
  )

  if (!ready) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-[12]">
      <AnimatePresence>
        {visibleWidgets.map((widget) => (
          <WidgetContainer
            key={widget.id}
            widget={widget}
            viewport={viewport}
            projectedRect={projected.get(widget.id)}
            projectedMap={projected}
            onUpdatePosition={updateWidgetPosition}
            onRemove={removeWidget}
            onToggleLock={toggleWidgetLock}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
