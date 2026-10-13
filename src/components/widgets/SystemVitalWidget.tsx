import { useMemo } from 'react'
import { ChartLine, Cpu, HardDrive, MemoryStick, Rows3 } from 'lucide-react'
import { useSystemSummary } from '@/hooks/useSystemSampler'
import { asRange, useMetricSeries } from '@/store/metricsStore'
import { useWidgetStore } from '@/store/widgetStore'
import { useI18n } from '@/lib/i18n'
import { LineChart, RangeSwitch } from './LineChart'
import type { WidgetProps } from './types'

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const pct = (v: number) => `${v.toFixed(0)}%`

interface MeterProps {
  icon: React.ReactNode
  label: string
  percent: number
  detail?: string
  color: string
  loading: boolean
}

function Meter({ icon, label, percent, detail, color, loading }: MeterProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-[var(--win-text)]" style={{ color: 'var(--win-text)' }}>
          <span style={{ color }}>{icon}</span>
          {label}
        </span>
        <span className="font-mono font-semibold" style={{ color }}>
          {loading ? '...' : `${percent.toFixed(percent < 10 ? 1 : 0)}%`}
          {detail ? <span className="ml-1 text-[9px] font-normal text-[var(--text-secondary)]">({detail})</span> : null}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        style={{ backgroundColor: 'var(--panel-surface-strong)' }}
      >
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export function SystemVitalWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const { data: summary, isLoading } = useSystemSummary()
  const updateConfig = useWidgetStore((s) => s.updateWidgetConfig)
  const mode = widget.config?.mode === 'graph' ? 'graph' : 'bars'
  const range = asRange(widget.config?.range)

  const cpuPoints = useMetricSeries('cpu')
  const ramPoints = useMetricSeries('ram')
  const diskPoints = useMetricSeries('disk')

  const cpu = summary?.cpuUsagePercent ?? 0
  const ramTotal = summary?.memory?.total ?? 0
  const ramUsed = summary?.memory?.used ?? 0
  const ram = ramTotal > 0 ? Math.min(100, (ramUsed / ramTotal) * 100) : 0
  const diskTotal = summary?.storage?.total ?? 0
  const diskUsed = summary?.storage?.used ?? 0
  const disk = diskTotal > 0 ? Math.min(100, (diskUsed / diskTotal) * 100) : 0

  const series = useMemo(
    () => [
      { key: 'cpu', label: 'CPU', color: 'var(--panel-info-text)', points: cpuPoints },
      { key: 'ram', label: 'RAM', color: 'var(--panel-success-text)', points: ramPoints },
      { key: 'disk', label: 'Disk', color: 'var(--panel-warning-text)', points: diskPoints },
    ],
    [cpuPoints, ramPoints, diskPoints],
  )

  const modeButton = (value: 'bars' | 'graph', icon: React.ReactNode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      title={label}
      aria-label={label}
      onClick={() => updateConfig(widget.id, { mode: value })}
      className={`rounded p-1 transition-colors ${
        mode === value
          ? 'bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)]'
      }`}
    >
      {icon}
    </button>
  )

  return (
    <div className="flex flex-1 select-none flex-col justify-between gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
          {mode === 'graph' ? t('widget.vital.history') : t('widget.vital.now')}
        </span>
        <div className="flex items-center gap-1">
          {mode === 'graph' ? <RangeSwitch label={t('widget.graph.range')} value={range} onChange={(r) => updateConfig(widget.id, { range: r })} /> : null}
          <div className="flex items-center rounded-md border p-0.5" style={{ borderColor: 'var(--win-border)' }}>
            {modeButton('bars', <Rows3 size={11} />, t('widget.vital.modeBars'))}
            {modeButton('graph', <ChartLine size={11} />, t('widget.vital.modeGraph'))}
          </div>
        </div>
      </div>

      {mode === 'bars' ? (
        <div className="flex flex-1 flex-col justify-between gap-2">
          <Meter icon={<Cpu size={11} />} label="CPU" percent={cpu} color="var(--panel-info-text)" loading={isLoading} />
          <Meter icon={<MemoryStick size={11} />} label="RAM" percent={ram} detail={formatBytes(ramUsed)} color="var(--panel-success-text)" loading={isLoading} />
          <Meter icon={<HardDrive size={11} />} label="Disk" percent={disk} detail={formatBytes(diskUsed)} color="var(--panel-warning-text)" loading={isLoading} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-1.5">
          <LineChart ariaLabel={t('widget.vital.aria')} range={range} yMax={100} height={78} format={pct} area={false} series={series} />
          <div className="flex items-center justify-between font-mono text-[10px]">
            {[
              { label: 'CPU', value: cpu, color: 'var(--panel-info-text)' },
              { label: 'RAM', value: ram, color: 'var(--panel-success-text)' },
              { label: 'Disk', value: disk, color: 'var(--panel-warning-text)' },
            ].map((item) => (
              <span key={item.label} className="flex items-center gap-1 text-[var(--text-secondary)]">
                <span className="h-1.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
                <strong className="font-semibold" style={{ color: item.color }}>
                  {item.value.toFixed(0)}%
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
