import { AnimatePresence } from 'framer-motion'
import { useWidgetStore } from '@/store/widgetStore'
import { WidgetContainer } from './WidgetContainer'
import { useSystemSampler } from '@/hooks/useSystemSampler'
import { useWidgetSync } from '@/hooks/useWidgetSync'

export function DesktopWidgetLayer() {
  const { placedWidgets, updateWidgetPosition, removeWidget, toggleWidgetLock } = useWidgetStore()
  // Keeps the persisted CPU/RAM/disk/network history growing while the desktop is open
  useSystemSampler()
  // Layout and notes are per account and come from the server; hide until loaded
  const ready = useWidgetSync()

  if (!ready) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-[12]">
      <AnimatePresence>
        {placedWidgets.map((widget) => (
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
