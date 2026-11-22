import { AnimatePresence } from 'framer-motion'
import { useWidgetStore, widgetAllowedFor } from '@/store/widgetStore'
import { useAuthStore } from '@/store/authStore'
import { WidgetContainer } from './WidgetContainer'
import { useSystemSampler } from '@/hooks/useSystemSampler'
import { useWidgetSync } from '@/hooks/useWidgetSync'

export function DesktopWidgetLayer() {
  const { placedWidgets, updateWidgetPosition, removeWidget, toggleWidgetLock } = useWidgetStore()
  // Keeps the persisted CPU/RAM/disk/network history growing while the desktop is open
  useSystemSampler()
  // Layout and notes are per account and come from the server; hide until loaded
  const ready = useWidgetSync()
  const role = useAuthStore((s) => s.user?.role)

  if (!ready) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-[12]">
      <AnimatePresence>
        {placedWidgets.filter((w) => widgetAllowedFor(w.type, role)).map((widget) => (
          <WidgetContainer
            key={widget.id}
            widget={widget}
            onUpdatePosition={updateWidgetPosition}
            onRemove={removeWidget}
            onToggleLock={toggleWidgetLock}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
