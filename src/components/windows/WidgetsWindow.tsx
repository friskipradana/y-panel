import { useState } from 'react'
import { Activity, Clock, Gauge, Move, Network, Plus, Puzzle, Radar, RotateCcw, StickyNote, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MULTI_INSTANCE_WIDGETS, WIDGET_CATALOG, orderWidgetsForMobile, useWidgetStore } from '@/store/widgetStore'
import type { PlacedWidget, WidgetType } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/states'
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
  const visibleInstalled = (isMobile ? orderWidgetsForMobile(placedWidgets, mobileOrder) : placedWidgets).filter(
    (w) => !(isMobile && w.type === 'system-vital'),
  )
  const catalog = WIDGET_CATALOG.filter((item) => !(isMobile && item.type === 'system-vital'))

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

  return (
    <div className="panel-window flex h-full flex-col">
      <div className="flex min-h-[40px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Puzzle className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-[var(--win-text)]">{t('widgets.gallery')}</span>
          <span>•</span>
          <span>{t('widgets.installedCount', { count: visibleInstalled.length })}</span>
        </div>
        <Button
          variant="ghost"
          className="px-2.5 py-1 text-xs"
          onClick={resetLayout}
          disabled={placedWidgets.length === 0}
          title={isMobile ? t('widgets.resetMobileTitle') : t('widgets.resetTitle')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {isMobile ? t('widgets.resetMobile') : t('widgets.reset')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-3 sm:p-4">
        <section aria-labelledby="widgets-installed">
          <h2 id="widgets-installed" className="panel-section-label mb-2">
            {t('widgets.sectionInstalled')}
          </h2>
          {visibleInstalled.length === 0 ? (
            <EmptyState icon={<Puzzle />}>{t('widgets.noneInstalled')}</EmptyState>
          ) : (
            <div className="panel-table-container">
              {visibleInstalled.map((widget) => {
                const Icon = WIDGET_ICONS[widget.type]
                const extra = detail(widget)
                return (
                  <EntityRow
                    key={widget.id}
                    centered
                    className="p-3"
                    leading={
                      <IconBadge size="md" tone="primary">
                        <Icon />
                      </IconBadge>
                    }
                    title={t(`widget.catalog.${widget.type}.title`)}
                    badges={widget.isLocked && !isMobile ? <Badge tone="warning">{t('widgets.locked')}</Badge> : undefined}
                    subtitle={extra ? <span className="panel-mono">{extra}</span> : undefined}
                    actions={
                      <IconButton label={t('mobile.widgetRemove')} tone="danger" onClick={() => void confirmRemove(widget)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    }
                  />
                )
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="widgets-gallery">
          <h2 id="widgets-gallery" className="panel-section-label mb-1">
            {t('widgets.sectionGallery')}
          </h2>
          <p className="mb-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {isMobile ? t('widgets.galleryHintMobile') : t('widgets.galleryHint')}
          </p>
          <div className="panel-table-container">
            {catalog.map((item) => {
              const Icon = WIDGET_ICONS[item.type]
              const multi = MULTI_INSTANCE_WIDGETS.includes(item.type)
              const installed = !multi && placedWidgets.some((w) => w.type === item.type)
              return (
                <div
                  key={item.type}
                  draggable={!isMobile}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/ypanel-widget', item.type)
                    e.dataTransfer.setData('text/plain', item.type)
                    e.dataTransfer.effectAllowed = 'copy'
                    setDraggedType(item.type)
                  }}
                  onDragEnd={() => setDraggedType(null)}
                  className={draggedType === item.type ? 'opacity-50' : ''}
                >
                  <EntityRow
                    centered
                    className="p-3"
                    leading={
                      <IconBadge size="md">
                        <Icon />
                      </IconBadge>
                    }
                    title={t(`widget.catalog.${item.type}.title`)}
                    badges={<Badge tone="neutral">{item.badge}</Badge>}
                    subtitle={<span className="[word-break:normal]">{t(`widget.catalog.${item.type}.subtitle`)}</span>}
                    meta={
                      !isMobile ? (
                        <span className="inline-flex items-center gap-1">
                          <Move size={12} />
                          {t('widgets.dragHint')}
                        </span>
                      ) : undefined
                    }
                    actions={
                      installed ? (
                        <Badge tone="success" dot>
                          {t('widgets.installed')}
                        </Badge>
                      ) : (
                        <Button variant="primary-soft" onClick={() => addWidget(item.type)} title={t('widgets.installTitle')}>
                          <Plus className="h-3.5 w-3.5" />
                          {t('widgets.install')}
                        </Button>
                      )
                    }
                  />
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
