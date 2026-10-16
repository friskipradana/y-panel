import type { ReactNode } from 'react'
import { Activity, ArrowDown, ArrowUp, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { IconBadge } from '@/components/ui/IconBadge'
import { useI18n } from '@/lib/i18n'
import type { SpeedLive } from '@/api/speedtest'
import { useAnimatedNumber } from './useAnimatedNumber'

// Samples of one phase as a filled line; scales to its own peak
function Trace({ samples }: { samples: number[] }) {
  if (samples.length < 2) return <span className="speed-stat__trace" aria-hidden="true" />
  const peak = Math.max(...samples, 1)
  const step = 100 / (samples.length - 1)
  const points = samples.map((v, i) => `${(i * step).toFixed(2)},${(28 - (v / peak) * 26).toFixed(2)}`)
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="speed-stat__trace" aria-hidden="true">
      <polygon points={`0,30 ${points.join(' ')} 100,30`} className="speed-stat__area" />
      <polyline points={points.join(' ')} className="speed-stat__line" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Change against the previous test of the same kind, in percent
function Delta({ percent }: { percent: number | null }) {
  const { t } = useI18n()
  if (percent === null || Math.abs(percent) < 1) return null
  const up = percent > 0
  return (
    <Badge tone={up ? 'success' : 'warning'} title={t('speedtest.deltaHint')}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(percent).toFixed(0)}%
    </Badge>
  )
}

interface StatProps {
  icon: ReactNode
  label: string
  value: number | null
  unit: string
  active: boolean
  tone?: 'upload'
  samples?: number[]
  delta?: number | null
  /** Teks pengganti angka, mis. server hanya melayani unduhan */
  unavailable?: string
  large?: boolean
}

function Stat({ icon, label, value, unit, active, tone, samples, delta, unavailable, large }: StatProps) {
  const shown = useAnimatedNumber(value ?? 0)
  const classes = ['speed-stat', large ? 'speed-stat--large' : '', tone === 'upload' ? 'speed-stat--upload' : '', active ? 'speed-stat--active' : '']
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      <IconBadge size="sm" tone={active ? 'primary' : 'neutral'}>{icon}</IconBadge>
      <div className="min-w-0">
        <div className="speed-stat__label">{label}</div>
        {unavailable ? (
          <div className="speed-stat__hint">{unavailable}</div>
        ) : (
          <div className="speed-stat__value">
            {value === null ? '-' : shown.toFixed(shown >= 100 ? 0 : 1)} <span className="speed-stat__unit">{unit}</span>
          </div>
        )}
      </div>
      {delta !== undefined ? <Delta percent={delta} /> : null}
      {samples ? <Trace samples={samples} /> : null}
    </div>
  )
}

interface SpeedStatsProps {
  live: SpeedLive
  /** Perubahan unduh/unggah dibanding tes sebelumnya (persen) */
  delta: { download: number | null; upload: number | null }
  uploadAvailable: boolean
}

// The figures fill in as the test measures them; the active one is highlighted
export function SpeedStats({ live, delta, uploadAvailable }: SpeedStatsProps) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <Stat
        large
        icon={<ArrowDown />}
        label={t('speedtest.download')}
        value={live.downloadMbps}
        unit="Mbps"
        active={live.phase === 'download'}
        samples={live.downSamples}
        delta={delta.download}
        unavailable={live.phase === 'done' && live.downloadMbps === 0 ? t('speedtest.unmeasured') : undefined}
      />
      <Stat
        large
        tone="upload"
        icon={<ArrowUp />}
        label={t('speedtest.upload')}
        value={live.uploadMbps}
        unit="Mbps"
        active={live.phase === 'upload'}
        samples={uploadAvailable ? live.upSamples : undefined}
        delta={uploadAvailable ? delta.upload : undefined}
        unavailable={!uploadAvailable ? t('speedtest.downloadOnly') : live.phase === 'done' && live.uploadMbps === 0 ? t('speedtest.unmeasured') : undefined}
      />
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<Timer />} label={t('speedtest.latency')} value={live.latencyMs} unit="ms" active={live.phase === 'ping'} />
        <Stat icon={<Activity />} label={t('speedtest.jitter')} value={live.jitterMs} unit="ms" active={false} />
      </div>
    </div>
  )
}
