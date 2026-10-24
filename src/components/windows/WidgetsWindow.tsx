import { useState } from 'react'
import {
  Activity,
  Clock,
  Gauge,
  GripVertical,
  LayoutGrid,
  List as ListIcon,
  Lock,
  Network,
  Plus,
  Radar,
  RotateCcw,
  StickyNote,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  MULTI_INSTANCE_WIDGETS,
  WIDGET_CATALOG,
  orderWidgetsForMobile,
  useWidgetStore,
  widgetAllowedFor,
  type StickyNote as NoteData,
} from '@/store/widgetStore'
import { useAuthStore } from '@/store/authStore'
import type { PlacedWidget, WidgetType } from '@/types'
import { ListRowIcon } from '@/components/ui/ListTable'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const WIDGET_ICONS: Record<WidgetType, LucideIcon> = {
  'clock-uptime': Clock,
  'system-vital': Gauge,
  'network-traffic': Network,
  'quick-note': StickyNote,
  'cpu-graph': Activity,
  ping: Radar,
}

// One short line that tells two widgets of the same type apart
function detail(widget: PlacedWidget, notes: NoteData[]): string {
  const cfg = widget.config ?? {}
  if (widget.type === 'ping') {
    const host = String(cfg.host ?? '')
    const port = Number(cfg.port ?? 0)
    return host ? (port > 0 ? `${host}:${port}` : host) : ''
  }
  if (widget.type === 'quick-note') {
    const text = (notes.find((n) => n.id === cfg.noteId)?.text ?? '').replace(/\s+/g, ' ').trim()
    return text.length > 48 ? `${text.slice(0, 48)}...` : text
  }
  return ''
}

// Installed widgets (with remove) and the gallery to add more. Supports Grid and List views.
export function WidgetsWindow() {
  const { t } = useI18n()
  const isMobile = useIsMobileLayout()
  const placedWidgets = useWidgetStore((s) => s.placedWidgets)
  const notes = useWidgetStore((s) => s.notes)
  const mobileOrder = useWidgetStore((s) => s.mobile.order)
  const addWidget = useWidgetStore((s) => s.addWidget)
  const removeWidget = useWidgetStore((s) => s.removeWidget)
  const resetLayout = useWidgetStore((s) => s.resetLayout)
  const [draggedType, setDraggedType] = useState<WidgetType | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // the host card on the phone home already shows CPU, RAM and disk
  const role = useAuthStore((s) => s.user?.role)
  const visibleInstalled = (isMobile ? orderWidgetsForMobile(placedWidgets, mobileOrder) : placedWidgets).filter(
    (w) => !(isMobile && w.type === 'system-vital') && widgetAllowedFor(w.type, role),
  )
  const catalog = WIDGET_CATALOG.filter((item) => !(isMobile && item.type === 'system-vital') && widgetAllowedFor(item.type, role))

  const confirmRemove = async (widget: PlacedWidget) => {
    const ok = await alertLib.confirm(
      t('widgets.removeQuestion'),
      t('widgets.removeMessage', { name: t(`widget.catalog.${widget.type}.title`) }),
      t('widgets.removeConfirm'),
      t('common.cancel'),
      'warning',
      'widgets',
    )
    if (ok) removeWidget(widget.id)
  }

  const install = (type: WidgetType) => {
    addWidget(type)
    toast.success(t('widgets.installedToast', { name: t(`widget.catalog.${type}.title`) }), {
      description: isMobile ? t('widgets.installedToastMobile') : t('widgets.installedToastDesktop'),
    })
  }

  return (
    <div className="panel-window docker-window-root relative overflow-hidden flex flex-col h-full">
      <div className="docker-topbar shrink-0">
        <div className="docker-topbar__left flex items-center gap-3">
          <div className="docker-topbar__meta">
            <span className="font-semibold text-[var(--win-text)]">{t('widgets.gallery')}</span>
            <span>{t('widgets.installedCount', { count: visibleInstalled.length })}</span>
          </div>
        </div>

        <div className="docker-topbar__right flex items-center gap-2">
          {/* Grid / List Mode Switcher */}
          <div className="flex items-center rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[var(--tb-hover)] text-[var(--win-text)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
              }`}
              title={t('widgets.viewGrid')}
              aria-label={t('widgets.viewGrid')}
            >
              <LayoutGrid size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--tb-hover)] text-[var(--win-text)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
              }`}
              title={t('widgets.viewList')}
              aria-label={t('widgets.viewList')}
            >
              <ListIcon size={13} strokeWidth={1.75} />
            </button>
          </div>

          <button
            type="button"
            className="docker-secondary-btn"
            onClick={resetLayout}
            disabled={placedWidgets.length === 0}
            title={isMobile ? t('widgets.resetMobileTitle') : t('widgets.resetTitle')}
            aria-label={isMobile ? t('widgets.resetMobileTitle') : t('widgets.resetTitle')}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="docker-secondary-btn__text">{isMobile ? t('widgets.resetMobile') : t('widgets.reset')}</span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3.5 sm:p-4">
        {/* Section 1: Installed Widgets (Clean compact rows) */}
        {visibleInstalled.length > 0 ? (
          <section aria-labelledby="widgets-installed" className="widgets-section space-y-2">
            <h2 id="widgets-installed" className="panel-section-label">
              {t('widgets.sectionInstalled')}
            </h2>
            <div className="overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)]">
              {visibleInstalled.map((widget) => {
                const Icon = WIDGET_ICONS[widget.type]
                const extra = detail(widget, notes)
                const locked = widget.isLocked && !isMobile
                return (
                  <div
                    key={widget.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--panel-surface-hover)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ListRowIcon>
                        <Icon className="h-3.5 w-3.5" />
                      </ListRowIcon>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-[var(--win-text)] truncate">
                            {t(`widget.catalog.${widget.type}.title`)}
                          </span>
                          {extra ? (
                            <span className="text-[11px] text-[var(--text-secondary)] truncate" title={extra}>
                              {extra}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`docker-status-pill docker-status-pill--${locked ? 'paused' : 'running'}`}>
                        {locked ? <Lock className="h-3 w-3" strokeWidth={1.75} /> : <span className="docker-status-dot" />}
                        <span>{locked ? t('widgets.locked') : t('widgets.installed')}</span>
                      </span>
                      <button
                        type="button"
                        className="docker-act-btn docker-act-btn--danger"
                        title={t('mobile.widgetRemove')}
                        aria-label={t('mobile.widgetRemove')}
                        onClick={() => void confirmRemove(widget)}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {/* Section 2: Catalog Gallery (Grid or List Mode) */}
        <section aria-labelledby="widgets-gallery" className="widgets-section space-y-2.5">
          <h2 id="widgets-gallery" className="panel-section-label">
            {t('widgets.sectionGallery')}
          </h2>

          {viewMode === 'grid' ? (
            /* Mode Grid: Visual 2-column tiles with far-corner drag hint */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {catalog.map((item) => {
                const Icon = WIDGET_ICONS[item.type]
                const multi = MULTI_INSTANCE_WIDGETS.includes(item.type)
                const installed = !multi && placedWidgets.some((w) => w.type === item.type)
                return (
                  <div
                    key={item.type}
                    draggable={!isMobile}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-reneo-widget', item.type)
                      e.dataTransfer.setData('text/plain', item.type)
                      e.dataTransfer.effectAllowed = 'copy'
                      setDraggedType(item.type)
                    }}
                    onDragEnd={() => setDraggedType(null)}
                    className={`group relative flex flex-col justify-between rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3.5 transition-all hover:border-[var(--win-border-focus)] hover:bg-[var(--panel-surface-hover)] ${
                      isMobile ? '' : 'cursor-grab active:cursor-grabbing'
                    }${draggedType === item.type ? ' opacity-50 scale-98' : ''}`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ListRowIcon>
                            <Icon className="h-3.5 w-3.5" />
                          </ListRowIcon>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] px-1.5 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--win-bar)]">
                            {t(`widget.catalog.${item.type}.badge`)}
                          </span>
                        </div>
                        {!isMobile ? (
                          <span
                            className="text-[var(--text-secondary)] opacity-35 group-hover:opacity-100 transition-opacity p-0.5"
                            title={t('widgets.dragHint')}
                          >
                            <GripVertical size={14} />
                          </span>
                        ) : null}
                      </div>

                      <h3 className="text-[13px] font-semibold text-[var(--win-text)] mt-2.5">
                        {t(`widget.catalog.${item.type}.title`)}
                      </h3>
                      <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)] mt-1 line-clamp-2">
                        {t(`widget.catalog.${item.type}.subtitle`)}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[var(--win-border)] flex items-center justify-end">
                      {installed ? (
                        <span className="docker-status-pill docker-status-pill--running">
                          <span className="docker-status-dot" />
                          <span>{t('widgets.installed')}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="docker-secondary-btn w-full justify-center !h-7.5"
                          title={t('widgets.installTitle')}
                          aria-label={`${t('widgets.install')} ${t(`widget.catalog.${item.type}.title`)}`}
                          onClick={() => install(item.type)}
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                          <span>{t('widgets.install')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Mode List: Clean rows with GripVertical at the far LEFT */
            <div className="overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)]">
              {catalog.map((item) => {
                const Icon = WIDGET_ICONS[item.type]
                const multi = MULTI_INSTANCE_WIDGETS.includes(item.type)
                const installed = !multi && placedWidgets.some((w) => w.type === item.type)
                return (
                  <div
                    key={item.type}
                    draggable={!isMobile}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-reneo-widget', item.type)
                      e.dataTransfer.setData('text/plain', item.type)
                      e.dataTransfer.effectAllowed = 'copy'
                      setDraggedType(item.type)
                    }}
                    onDragEnd={() => setDraggedType(null)}
                    className={`group flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--panel-surface-hover)] ${
                      isMobile ? '' : 'cursor-grab active:cursor-grabbing'
                    }${draggedType === item.type ? ' opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {!isMobile ? (
                        <span
                          className="text-[var(--text-secondary)] opacity-35 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab"
                          title={t('widgets.dragHint')}
                        >
                          <GripVertical size={14} />
                        </span>
                      ) : null}
                      <ListRowIcon>
                        <Icon className="h-3.5 w-3.5" />
                      </ListRowIcon>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-[var(--win-text)] truncate">
                            {t(`widget.catalog.${item.type}.title`)}
                          </span>
                          <span className="text-[10px] font-medium text-[var(--text-secondary)] px-1.5 py-0.2 rounded border border-[var(--win-border)] bg-[var(--win-bar)] shrink-0">
                            {t(`widget.catalog.${item.type}.badge`)}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-[var(--text-secondary)] truncate mt-0.5">
                          {t(`widget.catalog.${item.type}.subtitle`)}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {installed ? (
                        <span className="docker-status-pill docker-status-pill--running">
                          <span className="docker-status-dot" />
                          <span>{t('widgets.installed')}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="docker-secondary-btn !h-7.5"
                          title={t('widgets.installTitle')}
                          aria-label={`${t('widgets.install')} ${t(`widget.catalog.${item.type}.title`)}`}
                          onClick={() => install(item.type)}
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                          <span>{t('widgets.install')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
