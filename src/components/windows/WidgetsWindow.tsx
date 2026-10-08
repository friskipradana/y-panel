import { useState } from 'react'
import { Plus, Check, RotateCcw, Move } from 'lucide-react'
import { WIDGET_CATALOG, useWidgetStore } from '@/store/widgetStore'
import type { WidgetType } from '@/types'

export function WidgetsWindow() {
  const { placedWidgets, addWidget, resetToDefault } = useWidgetStore()
  const [draggedType, setDraggedType] = useState<WidgetType | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, type: WidgetType) => {
    e.dataTransfer.setData('application/ypanel-widget', type)
    e.dataTransfer.setData('text/plain', type)
    e.dataTransfer.effectAllowed = 'copy'
    setDraggedType(type)
  }

  const handleDragEnd = () => {
    setDraggedType(null)
  }

  const handleAddClick = (type: WidgetType) => {
    addWidget(type)
    setJustAdded(type)
    setTimeout(() => setJustAdded(null), 1500)
  }

  return (
    <div className="flex h-full flex-col bg-[var(--win-content-bg)] text-[var(--win-text)] select-none overflow-y-auto">
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-[var(--win-border)] bg-[var(--win-bar)] px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧩</span>
            <h2 className="text-base font-bold text-[var(--win-text)] tracking-tight">Widget Gallery</h2>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-500">
              Desktop Modules
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Tarik (drag) kartu widget dari galeri ini langsung ke layar desktop, atau klik tombol pasang.
          </p>
        </div>

        <button
          type="button"
          onClick={resetToDefault}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-3 py-1.5 text-xs font-medium text-[var(--win-text)] transition hover:bg-[var(--panel-surface-hover)]"
        >
          <RotateCcw size={12} className="text-[var(--text-secondary)]" />
          Reset Tata Letak
        </button>
      </div>

      {/* Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
        {WIDGET_CATALOG.map((item) => {
          const isPlaced = placedWidgets.some((w) => w.type === item.type)
          const isBeingDragged = draggedType === item.type
          const wasJustAdded = justAdded === item.type

          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => handleDragStart(e, item.type)}
              onDragEnd={handleDragEnd}
              className={`group flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-grab active:cursor-grabbing ${
                isBeingDragged
                  ? 'opacity-40 border-cyan-500 scale-95'
                  : 'border-[var(--win-border)] bg-[var(--panel-surface)] hover:border-cyan-500/50 hover:bg-[var(--panel-surface-hover)] shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--win-text)]">{item.title}</h3>
                      <span className="rounded bg-[var(--panel-surface-strong)] border border-[var(--win-border)] px-1.5 py-0.5 text-[9px] font-mono uppercase text-[var(--text-secondary)]">
                        {item.badge}
                      </span>
                    </div>
                  </div>

                  {isPlaced && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                      <Check size={10} /> Aktif
                    </span>
                  )}
                </div>

                <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {item.subtitle}
                </p>
              </div>

              {/* Bottom Actions */}
              <div className="mt-5 flex items-center justify-between border-t border-[var(--win-border)] pt-3 text-xs">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] group-hover:text-cyan-500 transition-colors">
                  <Move size={12} />
                  <span>Drag ke desktop</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddClick(item.type)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    wasJustAdded
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30'
                  }`}
                >
                  {wasJustAdded ? (
                    <>
                      <Check size={12} /> Terpasang!
                    </>
                  ) : (
                    <>
                      <Plus size={12} /> Pasang
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WidgetsWindow
