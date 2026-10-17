import { History, Trash2 } from 'lucide-react'
import { ListRowIcon, ListTable } from '@/components/ui/ListTable'
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
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="panel-section-label">{t('speedtest.history')}</p>
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('speedtest.historyHint')}</p>
        </div>
        <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('speedtest.clearAction')} aria-label={t('speedtest.clearAction')} onClick={() => void confirmClear()}>
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--win-border)]">
        <ListTable
          variant="speed"
          columns={[
            { label: t('speedtest.history.test') },
            { label: t('speedtest.download') },
            { label: t('speedtest.upload') },
            { label: t('speedtest.latency') },
            { label: t('speedtest.history.time') },
          ]}
        >
          {items.map((item) => {
            const where = item.kind === 'server' ? (item.serverName ?? item.server ?? '') : window.location.host
            const up = figure(item.uploadMbps, item.canUpload !== false)
            return (
              <div key={`${item.kind}-${item.at}`} className="docker-row">
                <div className="docker-row__app">
                  <ListRowIcon><History className="h-3.5 w-3.5" /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name">{item.kind === 'server' ? t('speedtest.tab.server') : t('speedtest.tab.browser')}</span>
                    <span className="docker-row__sub panel-mono" title={where}>{where}</span>
                    <span className="docker-row__meta">{`${figure(item.downloadMbps)} / ${up} Mbps \u00b7 ${figure(item.latencyMs)} ms \u00b7 ${formatDateTimeID(new Date(item.at))}`}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--mono">{figure(item.downloadMbps)}</div>
                <div className="docker-cell docker-cell--mono">{up}</div>
                <div className="docker-cell docker-cell--mono">{figure(item.latencyMs)}</div>
                <div className="docker-cell">{formatDateTimeID(new Date(item.at))}</div>
              </div>
            )
          })}
        </ListTable>
      </div>
      <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('speedtest.history.units')}</p>
    </section>
  )
}
