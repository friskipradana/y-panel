import { useState } from 'react'
import { Activity, Clock, Gauge, GripVertical, Lock, Network, Plus, Puzzle, Radar, RotateCcw, StickyNote, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { MULTI_INSTANCE_WIDGETS, WIDGET_CATALOG, orderWidgetsForMobile, useWidgetStore, widgetAllowedFor } from '@/store/widgetStore'
import { useAuthStore } from '@/store/authStore'
import type { PlacedWidget, WidgetType } from '@/types'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
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
function detail(widget: PlacedWidget): string {
  const cfg = widget.config ?? {}
  if (widget.type === 'ping') {
    const host = String(cfg.host ?? '')
    const port = Number(cfg.port ?? 0)
    return host ? (port > 0 ? `${host}:${port}` : host) : ''
  }
  if (widget.type === 'quick-note') {
    const text = String(cfg.text ?? '').replace(/\s+/g, ' ').trim()
    return text.length > 48 ? `${text.slice(0, 48)}...` : text
  }
  return ''
}

// Installed widgets (with remove) and the gallery to add more. Same window on desktop and phone.
export function WidgetsWindow() {
  const { t } = useI18n()
  const isMobile = useIsMobileLayout()
  const placedWidgets = useWidgetStore((s) => s.placedWidgets)
  const mobileOrder = useWidgetStore((s) => s.mobile.order)
  const addWidget = useWidgetStore((s) => s.addWidget)
  const removeWidget = useWidgetStore((s) => s.removeWidget)
  const resetLayout = useWidgetStore((s) => s.resetLayout)
  const [draggedType, setDraggedType] = useState<WidgetType | null>(null)

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
    toast.success(t('widgets.installedToast', { name: t(`widget.catalog.${type}.title`) }), { description: isMobile ? t('widgets.installedToastMobile') : t('widgets.installedToastDesktop') })
  }

  return (
    <div className="panel-window docker-window-root relative overflow-hidden">
      <div className="docker-topbar">
        <div className="docker-topbar__left">
          <div className="docker-topbar__meta">
            <span className="font-semibold text-[var(--win-text)]">{t('widgets.gallery')}</span>
            <span>{t('widgets.installedCount', { count: visibleInstalled.length })}</span>
          </div>
        </div>
        <div className="docker-topbar__right">
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

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 sm:p-4">
        <section aria-labelledby="widgets-installed" className="widgets-section space-y-2">
          <h2 id="widgets-installed" className="panel-section-label">
            {t('widgets.sectionInstalled')}
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--win-border)]">
            <ListTable
              variant="widgets-installed"
              empty={visibleInstalled.length === 0}
              columns={[
                { label: t('widgets.col.widget') },
                { label: t('widgets.col.detail') },
                { label: t('widgets.col.status') },
                { label: t('widgets.col.actions'), actions: true },
              ]}
            >
              <ListState
                loading={false}
                error={false}
                errorTitle=""
                loadingText=""
                empty={visibleInstalled.length === 0}
                emptyIcon={<Puzzle />}
                emptyTitle={t('widgets.noneInstalled')}
              >
                {visibleInstalled.map((widget) => {
                  const Icon = WIDGET_ICONS[widget.type]
                  const extra = detail(widget)
                  const locked = widget.isLocked && !isMobile
                  return (
                    <div key={widget.id} className="docker-row">
                      <div className="docker-row__app">
                        <ListRowIcon><Icon className="h-3.5 w-3.5" /></ListRowIcon>
                        <div className="docker-row__text">
                          <span className="docker-app-name">{t(`widget.catalog.${widget.type}.title`)}</span>
                          <span className="docker-row__meta">{[extra, locked ? t('widgets.locked') : ''].filter(Boolean).join(' \u00b7 ')}</span>
                        </div>
                      </div>
                      <div className="docker-cell docker-cell--mono" title={extra}>{extra || '-'}</div>
                      <div className="docker-cell--keep">
                        <span className={`docker-status-pill docker-status-pill--${locked ? 'paused' : 'running'}`}>
                          {locked ? <Lock className="h-3 w-3" strokeWidth={1.75} /> : <span className="docker-status-dot" />}
                          <span>{locked ? t('widgets.locked') : t('widgets.installed')}</span>
                        </span>
                      </div>
                      <div className="docker-action-btns">
                        <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('mobile.widgetRemove')} aria-label={t('mobile.widgetRemove')} onClick={() => void confirmRemove(widget)}>
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </ListState>
            </ListTable>
          </div>
        </section>

        <section aria-labelledby="widgets-gallery" className="widgets-section space-y-2">
          <div>
            <h2 id="widgets-gallery" className="panel-section-label">
              {t('widgets.sectionGallery')}
            </h2>
            <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{isMobile ? t('widgets.galleryHintMobile') : t('widgets.galleryHint')}</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--win-border)]">
            <ListTable
              variant="widgets"
              columns={[
                { label: t('widgets.col.widget') },
                { label: t('widgets.col.about') },
                { label: t('widgets.col.actions'), actions: true },
              ]}
            >
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
                    className={`docker-row${isMobile ? '' : ' docker-row--grab'}${draggedType === item.type ? ' docker-row--dragging' : ''}`}
                  >
                    <div className="docker-row__app">
                      <ListRowIcon><Icon className="h-3.5 w-3.5" /></ListRowIcon>
                      <div className="docker-row__text">
                        <span className="docker-row__title">
                          <span className="docker-app-name">{t(`widget.catalog.${item.type}.title`)}</span>
                          <span className="text-[0.6875rem] text-[var(--text-secondary)]">{item.badge}</span>
                        </span>
                        <span className="docker-row__meta">{t(`widget.catalog.${item.type}.subtitle`)}</span>
                      </div>
                    </div>
                    <div className="docker-cell !whitespace-normal">
                      <span className="text-[0.75rem] leading-snug">{t(`widget.catalog.${item.type}.subtitle`)}</span>
                      {!isMobile ? (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[0.6875rem]">
                          <GripVertical size={12} />
                          {t('widgets.dragHint')}
                        </span>
                      ) : null}
                    </div>
                    <div className="docker-action-btns">
                      {installed ? (
                        <span className="docker-status-pill docker-status-pill--running">
                          <span className="docker-status-dot" />
                          <span>{t('widgets.installed')}</span>
                        </span>
                      ) : (
                        <button type="button" className="docker-secondary-btn" title={t('widgets.installTitle')} aria-label={`${t('widgets.install')} ${t(`widget.catalog.${item.type}.title`)}`} onClick={() => install(item.type)}>
                          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                          <span>{t('widgets.install')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </ListTable>
          </div>
        </section>
      </div>
    </div>
  )
}
