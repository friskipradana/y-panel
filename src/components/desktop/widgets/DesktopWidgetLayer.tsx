import { AnimatePresence } from 'framer-motion'
import { useWidgetStore } from '@/store/widgetStore'
import { WidgetContainer } from './WidgetContainer'

export function DesktopWidgetLayer() {
  const { placedWidgets, updateWidgetPosition, removeWidget, toggleWidgetLock } = useWidgetStore()

  return (
    <div className="absolute inset-0 pointer-events-none z-[8]">
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
