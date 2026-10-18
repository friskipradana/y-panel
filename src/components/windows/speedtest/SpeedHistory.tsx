import { Globe, Laptop, Trash2 } from 'lucide-react'
import { ListTable } from '@/components/ui/ListTable'
import { IconBadge } from '@/components/ui/IconBadge'
import { Button } from '@/components/ui/Button'
import { alertLib } from '@/lib/alert'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import type { HistoryItem } from './useSpeedtestWindow'

const figure = (value: number | undefined, available = true) =>
  !available || value === undefined ? '-' : value >= 100 ? value.toFixed(0) : value.toFixed(1)

// Last results, kept in this browser only: one row per test, figures in aligned columns
export function SpeedHistory({ items, onClear }: { items: HistoryItem[]; onClear: () => void }) {
  const { t } = useI18n()
  if (items.length === 0) return null

  const confirmClear = async () => {
    const ok = await alertLib.confirm(
      t('speedtest.clearTitle'),
      t('speedtest.clearMessage'),
      t('speedtest.clearAction'),
      t('common.cancel'),
      'warning',
      'speedtest'
    )
    if (ok) onClear()
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--win-text)]">
              {t('speedtest.history')}
            </span>
            <span className="panel-mono text-[11px] text-[var(--text-secondary)]">
              ({items.length})
            </span>
          </div>
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('speedtest.historyHint')}</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void confirmClear()}
          className="!h-7 !px-2 text-[11px] font-medium text-[var(--panel-danger-text)] hover:text-[var(--panel-danger-text)]"
          title={t('speedtest.clearAction')}
        >
          <Trash2 className="h-3 w-3 mr-1" strokeWidth={1.75} />
          <span>{t('speedtest.clearAction')}</span>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
        <ListTable
          variant="speed"
          columns={[
            { label: t('speedtest.history.test') },
            { label: `${t('speedtest.download')} (Mbps)` },
            { label: `${t('speedtest.upload')} (Mbps)` },
            { label: `${t('speedtest.latency')} (ms)` },
            { label: t('speedtest.history.time') },
          ]}
        >
          {items.map((item) => {
            const isServer = item.kind === 'server'
            const where = isServer ? (item.serverName ?? item.server ?? '') : window.location.host
            const up = figure(item.uploadMbps, item.canUpload !== false)

            return (
              <div key={`${item.kind}-${item.at}`} className="docker-row">
                <div className="docker-row__app">
                  <IconBadge size="sm" tone={isServer ? 'primary' : 'neutral'}>
                    {isServer ? <Globe className="h-3.5 w-3.5" /> : <Laptop className="h-3.5 w-3.5" />}
                  </IconBadge>
                  <div className="docker-row__text min-w-0">
                    <span className="docker-app-name">
                      {isServer ? t('speedtest.tab.server') : t('speedtest.tab.browser')}
                    </span>
                    <span className="docker-row__sub panel-mono" title={where}>
                      {where}
                    </span>
                    <span className="docker-row__meta">{`${figure(item.downloadMbps)} / ${up} Mbps \u00b7 ${figure(item.latencyMs)} ms \u00b7 ${formatDateTimeID(new Date(item.at))}`}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--mono font-semibold">{figure(item.downloadMbps)}</div>
                <div className="docker-cell docker-cell--mono font-semibold">{up}</div>
                <div className="docker-cell docker-cell--mono">{figure(item.latencyMs)}</div>
                <div className="docker-cell text-[12px] text-[var(--text-secondary)]">{formatDateTimeID(new Date(item.at))}</div>
              </div>
            )
          })}
        </ListTable>
      </div>
      <p className="text-[0.6875rem] text-[var(--text-secondary)]">{t('speedtest.history.units')}</p>
    </section>
  )
}
