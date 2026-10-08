import { useState } from 'react'
import { Plus, Check, RotateCcw, Move, Sparkles } from 'lucide-react'
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
    <div className="flex h-full flex-col bg-slate-950 text-slate-200 select-none overflow-y-auto">
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/50 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧩</span>
            <h2 className="text-base font-bold text-white tracking-tight">Widget Gallery</h2>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-400">
              Desktop Modules
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Tarik (drag) kartu widget dari galeri ini langsung ke layar desktop, atau klik tombol pasang.
          </p>
        </div>

        <button
          type="button"
          onClick={resetToDefault}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-850 hover:text-white"
        >
          <RotateCcw size={12} className="text-slate-400" />
          Reset Tata Letak
        </button>
      </div>

      {/* Drag & Drop Hint */}
      <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-4 py-2.5 text-xs text-cyan-300">
        <Sparkles size={14} className="shrink-0 text-cyan-400" />
        <span>
          <strong>Tips:</strong> Anda dapat menggeser posisi widget di desktop secara bebas kapan saja, atau menguncinya agar tidak bergeser.
        </span>
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
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90 shadow-lg shadow-black/20'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-mono uppercase text-slate-400">
                        {item.badge}
                      </span>
                    </div>
                  </div>

                  {isPlaced && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <Check size={10} /> Aktif
                    </span>
                  )}
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-400">
                  {item.subtitle}
                </p>
              </div>

              {/* Bottom Actions */}
              <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 group-hover:text-cyan-400 transition-colors">
                  <Move size={12} />
                  <span>Drag ke desktop</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddClick(item.type)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    wasJustAdded
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30'
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
