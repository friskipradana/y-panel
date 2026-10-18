import { useMemo } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useSystemSummary } from '@/hooks/useSystemSampler'
import { asRange } from '@/store/metricsStore'
import { useRangeSeries } from '@/store/liveStore'
import { useWidgetStore } from '@/store/widgetStore'
import { useI18n } from '@/lib/i18n'
import { LineChart, RangeSwitch } from './LineChart'
import type { WidgetProps } from './types'

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function NetworkTrafficWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const { data: summary } = useSystemSummary()
  const updateConfig = useWidgetStore((s) => s.updateWidgetConfig)
  const range = asRange(widget.config?.range)

  const rx = useRangeSeries('net-rx', range)
  const tx = useRangeSeries('net-tx', range)
  const rxNow = rx[rx.length - 1]?.v ?? 0
  const txNow = tx[tx.length - 1]?.v ?? 0

  const series = useMemo(
    () => [
      { key: 'net-rx', label: 'DL', color: 'var(--panel-success-text)', points: rx },
      { key: 'net-tx', label: 'UP', color: 'var(--panel-info-text)', points: tx },
    ],
    [rx, tx],
  )

  return (
    <div className="flex flex-1 select-none flex-col gap-2.5 p-3">
      <span className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{t('widget.net.title')}</span>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="flex flex-col rounded-lg border p-1.5" style={{ backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-1 font-semibold text-[var(--panel-success-text)]">
                <ArrowDown size={11} />
                DL
              </span>
              <span className="font-mono text-[9px]">{summary?.networkIO?.bytesRecv ? formatBytes(summary.networkIO.bytesRecv) : '-'}</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[13px] font-bold text-[var(--panel-success-text)]">{formatSpeed(rxNow)}</div>
          </div>
          <div className="flex flex-col rounded-lg border p-1.5" style={{ backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-1 font-semibold text-[var(--panel-info-text)]">
                <ArrowUp size={11} />
                UP
              </span>
              <span className="font-mono text-[9px]">{summary?.networkIO?.bytesSent ? formatBytes(summary.networkIO.bytesSent) : '-'}</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[13px] font-bold text-[var(--panel-info-text)]">{formatSpeed(txNow)}</div>
          </div>
        </div>

        <LineChart ariaLabel={t('widget.net.aria')} range={range} height={58} format={formatSpeed} series={series} />

        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-3 font-mono text-[9px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--panel-success-text)' }} />
              RX
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--panel-info-text)' }} />
              TX
            </span>
          </div>
          <RangeSwitch label={t('widget.graph.range')} value={range} onChange={(r) => updateConfig(widget.id, { range: r })} />
        </div>
      </div>
    </div>
  )
}
