import { useMemo } from 'react'
import { ArrowDown, ArrowUp, Lock, Unlock } from 'lucide-react'
import { AppIcon } from '@/components/common/AppIcon'
import { WIDGET_COMPONENTS } from '@/components/widgets/WidgetContainer'
import { DESKTOP_SHORTCUTS, canAccessWindow } from '@/components/desktop/windowRegistry'
import { useSystemSummary } from '@/hooks/useSystemSampler'
import { IconButton } from '@/components/ui/IconButton'
import { orderWidgetsForMobile, useWidgetStore } from '@/store/widgetStore'
import { useI18n, windowTitleKey } from '@/lib/i18n'
import type { WindowKind } from '@/types'

interface MobileHomeProps {
  role?: string | null
  onLaunch: (kind: WindowKind) => void
}

// Reachable from the desktop only through menus; the phone lists them here
const EXTRA_APPS: WindowKind[] = ['system-logs', 'changelog']

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`
}

function Meter({ label, percent, detail }: { label: string; percent: number; detail?: string }) {
  const pct = Math.min(100, Math.max(0, percent))
  const tone = pct >= 90 ? 'var(--panel-danger-text)' : pct >= 75 ? 'var(--panel-warning-text)' : 'var(--panel-info-text)'
  return (
    <div>
      <div className="flex items-baseline justify-between text-[0.75rem]">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="panel-mono font-semibold">
          {pct.toFixed(pct < 10 ? 1 : 0)}%{detail ? <span className="ml-1 font-normal text-[var(--text-secondary)]">{detail}</span> : null}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--panel-surface-strong)]"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tone }} />
      </div>
    </div>
  )
}

// Phone home: host status, every app one tap away, then the widgets stacked
export function MobileHome({ role, onLaunch }: MobileHomeProps) {
  const { t } = useI18n()
  const { data: summary } = useSystemSummary()
  const placed = useWidgetStore((s) => s.placedWidgets)
  const mobile = useWidgetStore((s) => s.mobile)
  const moveMobileWidget = useWidgetStore((s) => s.moveMobileWidget)
  const toggleMobileLock = useWidgetStore((s) => s.toggleMobileLock)
  const widgets = useMemo(() => orderWidgetsForMobile(placed, mobile.order), [placed, mobile.order])
  const apps = useMemo(
    () => [...DESKTOP_SHORTCUTS.map((a) => a.windowId), ...EXTRA_APPS].filter((kind) => canAccessWindow(kind, role)),
    [role],
  )

  const ramTotal = summary?.memory?.total ?? 0
  const diskTotal = summary?.storage?.total ?? 0

  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      <section aria-label={t('mobile.host')} className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="panel-mono truncate text-[0.9375rem] font-semibold">{summary?.hostname || '-'}</h2>
          {summary ? (
            <span className="panel-mono shrink-0 text-[0.75rem] text-[var(--text-secondary)]">
              {t('mobile.uptime', { value: formatUptime(summary.uptimeSeconds) })}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[0.75rem] text-[var(--text-secondary)]">{[summary?.osName, summary?.kernel].filter(Boolean).join(' · ')}</p>
        <div className="mt-3 space-y-2.5">
          <Meter label="CPU" percent={summary?.cpuUsagePercent ?? 0} />
          <Meter label="RAM" percent={ramTotal ? ((summary?.memory?.used ?? 0) / ramTotal) * 100 : 0} detail={formatBytes(summary?.memory?.used ?? 0)} />
          <Meter label="Disk" percent={diskTotal ? ((summary?.storage?.used ?? 0) / diskTotal) * 100 : 0} detail={formatBytes(summary?.storage?.used ?? 0)} />
        </div>
      </section>

      <section aria-label={t('mobile.apps')}>
        <h2 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{t('mobile.apps')}</h2>
        <ul className="grid grid-cols-3 gap-2">
          {apps.map((app) => (
            <li key={app}>
              <button
                type="button"
                onClick={() => onLaunch(app)}
                className="flex min-h-[5.25rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-1 py-3 text-center transition-colors active:bg-[var(--panel-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <AppIcon kind={app} size={28} />
                <span className="line-clamp-2 w-full break-words text-[0.75rem] font-medium leading-tight">{t(windowTitleKey(app))}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {widgets.length > 0 ? (
        <section aria-label={t('mobile.widgets')} className="space-y-3">
          <h2 className="text-[0.75rem] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{t('mobile.widgets')}</h2>
          {widgets.map((widget, index) => {
            const Component = WIDGET_COMPONENTS[widget.type]
            if (!Component) return null
            const locked = mobile.locked.includes(widget.id)
            return (
              <div key={widget.id} className="@container flex flex-col overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
                <div className="flex items-center justify-end gap-0.5 border-b border-[var(--win-border)] px-1.5 py-0.5">
                  <IconButton label={t('mobile.widgetUp')} disabled={locked || index === 0} onClick={() => moveMobileWidget(widget.id, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={t('mobile.widgetDown')} disabled={locked || index === widgets.length - 1} onClick={() => moveMobileWidget(widget.id, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={locked ? t('mobile.widgetUnlock') : t('mobile.widgetLock')}
                    tone={locked ? 'warning' : undefined}
                    aria-pressed={locked}
                    onClick={() => toggleMobileLock(widget.id)}
                  >
                    {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </IconButton>
                </div>
                <Component widget={widget} />
              </div>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}
