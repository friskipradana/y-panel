import { useMemo } from 'react'
import { Flame, History } from 'lucide-react'
import { useSystemSummary } from '@/hooks/useSystemSampler'
import { asRange, useMetricSeries } from '@/store/metricsStore'
import { useWidgetStore } from '@/store/widgetStore'
import { useI18n } from '@/lib/i18n'
import { LineChart, RangeSwitch } from './LineChart'
import { summarize } from './chartStats'
import type { WidgetProps } from './types'

const pct = (v: number) => `${v.toFixed(0)}%`

export function CpuGraphWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const { data: summary } = useSystemSummary()
  const points = useMetricSeries('cpu')
  const updateConfig = useWidgetStore((s) => s.updateWidgetConfig)
  const range = asRange(widget.config?.range)

  const stats = useMemo(() => summarize(points, range), [points, range])
  const current = summary?.cpuUsagePercent ?? points[points.length - 1]?.v ?? 0

  return (
    <div className="flex flex-1 select-none flex-col justify-between gap-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-bold tracking-tight text-[var(--win-text)]">{current.toFixed(1)}%</span>
          <span className="hidden text-[10px] uppercase text-[var(--text-secondary)] @[260px]:inline">{t('widget.cpu.usage')}</span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--text-secondary)]">
          <span title={t('widget.cpu.avgLoad')}>
            AVG <strong className="font-semibold text-[var(--win-text)]">{stats.avg.toFixed(1)}%</strong>
          </span>
          <span title={t('widget.cpu.peakLoad')}>
            MAX <strong className="font-semibold text-[var(--panel-warning-text)]">{stats.max.toFixed(0)}%</strong>
          </span>
          {typeof summary?.cpuTemp === 'number' && summary.cpuTemp > 0 ? (
            <span className="flex items-center gap-0.5 text-[var(--panel-danger-text)]" title={t('widget.cpu.temp')}>
              <Flame size={10} />
              {Math.round(summary.cpuTemp)}°
            </span>
          ) : null}
        </div>
      </div>

      <LineChart
        ariaLabel={t('widget.graph.cpuAria')}
        range={range}
        yMax={100}
        height={72}
        format={pct}
        series={[{ key: 'cpu', label: 'CPU', color: 'var(--panel-info-text)', points }]}
      />

      <div className="flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1 font-mono text-[9px] text-[var(--text-secondary)]">
          <History size={9} />
          {t('widget.graph.samples', { count: stats.count })}
        </span>
        <RangeSwitch label={t('widget.graph.range')} value={range} onChange={(r) => updateConfig(widget.id, { range: r })} />
      </div>
    </div>
  )
}
