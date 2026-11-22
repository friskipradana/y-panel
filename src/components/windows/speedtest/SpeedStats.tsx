import { Activity, ArrowDown, ArrowUp, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { IconBadge } from '@/components/ui/IconBadge'
import { useI18n } from '@/lib/i18n'
import type { SpeedLive } from '@/api/speedtest'
import { useAnimatedNumber } from './useAnimatedNumber'

// Samples of one phase as a filled line; scales to its own peak with smooth gradient
function Trace({ samples, isUpload }: { samples?: number[]; isUpload?: boolean }) {
  if (!samples || samples.length < 2) {
    return (
      <div className="speed-stat__trace-empty" aria-hidden="true">
        <span className="speed-stat__trace-baseline" />
      </div>
    )
  }

  const peak = Math.max(...samples, 1)
  const step = 100 / (samples.length - 1)
  const points = samples.map((v, i) => `${(i * step).toFixed(1)},${(28 - (v / peak) * 24).toFixed(1)}`)
  const fillPoints = `0,30 ${points.join(' ')} 100,30`
  const gradId = isUpload ? 'speedtest-trace-upload' : 'speedtest-trace-download'

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="speed-stat__trace" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--speed-accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--speed-accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#${gradId})`} />
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
    <Badge tone={up ? 'success' : 'warning'} size="sm" title={t('speedtest.deltaHint')}>
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      <span>{Math.abs(percent).toFixed(0)}%</span>
    </Badge>
  )
}

interface SpeedStatsProps {
  live: SpeedLive
  /** Perubahan unduh/unggah dibanding tes sebelumnya (persen) */
  delta: { download: number | null; upload: number | null }
  uploadAvailable: boolean
}

// Single unified right card matching the left speed-hero card
export function SpeedStats({ live, delta, uploadAvailable }: SpeedStatsProps) {
  const { t } = useI18n()
  const shownDown = useAnimatedNumber(live.downloadMbps ?? 0)
  const shownUp = useAnimatedNumber(live.uploadMbps ?? 0)
  const shownPing = useAnimatedNumber(live.latencyMs ?? 0)
  const shownJitter = useAnimatedNumber(live.jitterMs ?? 0)

  const formatNumber = (val: number | null, animated: number) =>
    val === null ? '-' : animated.toFixed(animated >= 100 ? 0 : 1)

  return (
    <div className="speed-stats-card">
      {/* 1. Download Row */}
      <div
        className={`speed-stat-row ${
          live.phase === 'download' ? 'speed-stat-row--active' : ''
        }`}
      >
        <div className="flex items-center gap-3 shrink-0">
          <IconBadge
            size="sm"
            tone={live.phase === 'download' ? 'primary' : 'neutral'}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </IconBadge>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="speed-stat__label">{t('speedtest.download')}</span>
              {delta.download !== null && delta.download !== undefined ? (
                <Delta percent={delta.download} />
              ) : null}
            </div>

            {live.phase === 'done' && live.downloadMbps === 0 ? (
              <div className="speed-stat__hint">{t('speedtest.unmeasured')}</div>
            ) : (
              <div className="speed-stat__value">
                <span>{formatNumber(live.downloadMbps, shownDown)}</span>
                <span className="speed-stat__unit">Mbps</span>
              </div>
            )}
          </div>
        </div>

        <div className="speed-stat__chart-wrap">
          <Trace samples={live.downSamples} isUpload={false} />
        </div>
      </div>

      {/* 2. Upload Row */}
      <div
        className={`speed-stat-row speed-stat-row--upload ${
          live.phase === 'upload' ? 'speed-stat-row--active' : ''
        }`}
      >
        <div className="flex items-center gap-3 shrink-0">
          <IconBadge
            size="sm"
            tone={live.phase === 'upload' ? 'info' : 'neutral'}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </IconBadge>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="speed-stat__label">{t('speedtest.upload')}</span>
              {uploadAvailable && delta.upload !== null && delta.upload !== undefined ? (
                <Delta percent={delta.upload} />
              ) : null}
            </div>

            {!uploadAvailable ? (
              <div className="speed-stat__hint">{t('speedtest.downloadOnly')}</div>
            ) : live.phase === 'done' && live.uploadMbps === 0 ? (
              <div className="speed-stat__hint">{t('speedtest.unmeasured')}</div>
            ) : (
              <div className="speed-stat__value">
                <span>{formatNumber(live.uploadMbps, shownUp)}</span>
                <span className="speed-stat__unit">Mbps</span>
              </div>
            )}
          </div>
        </div>

        <div className="speed-stat__chart-wrap">
          <Trace samples={uploadAvailable ? live.upSamples : undefined} isUpload={true} />
        </div>
      </div>

      {/* 3. Latency & Jitter Split Row */}
      <div className="speed-stats-card__bottom">
        <div
          className={`speed-stat-mini ${
            live.phase === 'ping' ? 'speed-stat-mini--active' : ''
          }`}
        >
          <IconBadge
            size="sm"
            tone={live.phase === 'ping' ? 'primary' : 'neutral'}
          >
            <Timer className="h-3.5 w-3.5" />
          </IconBadge>
          <div className="min-w-0">
            <div className="speed-stat__label">{t('speedtest.latency')}</div>
            <div className="speed-stat__value speed-stat__value--compact">
              <span>{formatNumber(live.latencyMs, shownPing)}</span>
              <span className="speed-stat__unit">ms</span>
            </div>
          </div>
        </div>

        <div className="speed-stat-mini">
          <IconBadge size="sm" tone="neutral">
            <Activity className="h-3.5 w-3.5" />
          </IconBadge>
          <div className="min-w-0">
            <div className="speed-stat__label">{t('speedtest.jitter')}</div>
            <div className="speed-stat__value speed-stat__value--compact">
              <span>{formatNumber(live.jitterMs, shownJitter)}</span>
              <span className="speed-stat__unit">ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
