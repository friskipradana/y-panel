import type { ReactNode } from 'react'
import { Activity, ArrowDown, ArrowUp, Timer } from 'lucide-react'
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

interface StatProps {
  icon: ReactNode
  label: string
  value: number | null
  unit: string
  active: boolean
  samples?: number[]
}

function Stat({ icon, label, value, unit, active, samples }: StatProps) {
  const shown = useAnimatedNumber(value ?? 0)
  return (
    <div className={`speed-stat ${active ? 'speed-stat--active' : ''}`}>
      <IconBadge size="sm" tone={active ? 'primary' : 'neutral'}>{icon}</IconBadge>
      <div className="min-w-0">
        <div className="speed-stat__label">{label}</div>
        <div className="speed-stat__value">
          {value === null ? '-' : shown.toFixed(shown >= 100 ? 0 : 1)} <span className="speed-stat__unit">{unit}</span>
        </div>
      </div>
      {samples ? <Trace samples={samples} /> : null}
    </div>
  )
}

// The figures fill in as the test measures them; the active one is highlighted
export function SpeedStats({ live }: { live: SpeedLive }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <Stat icon={<ArrowDown />} label={t('speedtest.download')} value={live.downloadMbps} unit="Mbps" active={live.phase === 'download'} samples={live.downSamples} />
      <Stat icon={<ArrowUp />} label={t('speedtest.upload')} value={live.uploadMbps} unit="Mbps" active={live.phase === 'upload'} samples={live.upSamples} />
      <Stat icon={<Timer />} label={t('speedtest.latency')} value={live.latencyMs} unit="ms" active={live.phase === 'ping'} />
      <Stat icon={<Activity />} label={t('speedtest.jitter')} value={live.jitterMs} unit="ms" active={false} />
    </div>
  )
}
