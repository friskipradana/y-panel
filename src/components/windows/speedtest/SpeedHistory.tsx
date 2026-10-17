import { History, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { alertLib } from '@/lib/alert'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import type { HistoryItem } from './useSpeedtestWindow'

const figure = (value: number | undefined, available = true) => (!available || value === undefined ? '-' : value >= 100 ? value.toFixed(0) : value.toFixed(1))

// Last results, kept in this browser only: one row per test, figures in aligned columns
export function SpeedHistory({ items, onClear }: { items: HistoryItem[]; onClear: () => void }) {
  const { t } = useI18n()
  if (items.length === 0) return null

  const confirmClear = async () => {
    const ok = await alertLib.confirm(t('speedtest.clearTitle'), t('speedtest.clearMessage'), t('speedtest.clearAction'), t('common.cancel'), 'warning', 'speedtest')
    if (ok) onClear()
  }

  return (
    <div className="panel-shell-card space-y-3 p-4">
      <SectionHeader
        icon={<History />}
        title={t('speedtest.history')}
        subtitle={t('speedtest.historyHint')}
        actions={
          <IconButton label={t('speedtest.clearAction')} tone="danger" onClick={() => void confirmClear()}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        }
      />

      <div className="overflow-hidden rounded-xl border border-[var(--win-border)]">
        <div
          aria-hidden="true"
          className="hidden gap-x-4 border-b border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] sm:grid sm:grid-cols-[minmax(0,1.6fr)_4.5rem_4.5rem_4.5rem_9rem]"
        >
          <span>{t('speedtest.history.test')}</span>
          <span className="text-right">{t('speedtest.download')}</span>
          <span className="text-right">{t('speedtest.upload')}</span>
          <span className="text-right">{t('speedtest.latency')}</span>
          <span className="text-right">{t('speedtest.history.time')}</span>
        </div>
        <ul>
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.at}`}
              className="grid gap-x-4 gap-y-1.5 border-b border-[var(--win-border)] px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.6fr)_4.5rem_4.5rem_4.5rem_9rem] sm:items-center"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge tone={item.kind === 'server' ? 'info' : 'neutral'}>{item.kind === 'server' ? t('speedtest.tab.server') : t('speedtest.tab.browser')}</Badge>
                <span className="panel-mono min-w-0 truncate text-[0.75rem] text-[var(--text-secondary)]" title={item.serverName ?? item.server}>
                  {item.kind === 'server' ? (item.server ?? '') : window.location.host}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-4 text-[0.8125rem] sm:contents">
                <span className="panel-mono sm:text-right">
                  <span className="mr-1 text-[0.6875rem] text-[var(--text-secondary)] sm:hidden">{t('speedtest.download')}</span>
                  {figure(item.downloadMbps)}
                </span>
                <span className="panel-mono sm:text-right">
                  <span className="mr-1 text-[0.6875rem] text-[var(--text-secondary)] sm:hidden">{t('speedtest.upload')}</span>
                  {figure(item.uploadMbps, item.canUpload !== false)}
                </span>
                <span className="panel-mono sm:text-right">
                  <span className="mr-1 text-[0.6875rem] text-[var(--text-secondary)] sm:hidden">{t('speedtest.latency')}</span>
                  {figure(item.latencyMs)}
                </span>
              </div>
              <span className="text-[0.75rem] text-[var(--text-secondary)] sm:text-right">{formatDateTimeID(new Date(item.at))}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('speedtest.history.units')}</p>
    </div>
  )
}
