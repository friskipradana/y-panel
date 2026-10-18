import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { SpeedLive, SpeedResult } from '@/api/speedtest'
import { IconBadge } from '@/components/ui/IconBadge'
import { SpeedGauge } from './SpeedGauge'
import { SpeedStats } from './SpeedStats'
import { SpeedSteps } from './SpeedSteps'

interface SpeedPanelProps {
  /** What this test measures, in a line */
  description: string
  /** Target host string */
  hostText?: string
  /** Selected or detected server name */
  serverName?: string
  /** Server notice/alert (e.g. Ookla CLI setup or licence) */
  notice?: ReactNode
  live: SpeedLive
  result: SpeedResult | null
  /** Hasil sebelumnya untuk perbandingan persen */
  previous: SpeedResult | null
  running: boolean
  /** False bila server yang dipilih hanya melayani unduhan */
  uploadAvailable: boolean
}

const change = (now: number | undefined, before: number | undefined) =>
  now !== undefined && before !== undefined && before > 0 ? ((now - before) / before) * 100 : null

// One test: meter and steps on the left, the figures on the right, all live
export function SpeedPanel({
  description,
  hostText,
  serverName,
  notice,
  live,
  result,
  previous,
  running,
  uploadAvailable,
}: SpeedPanelProps) {
  const { t } = useI18n()
  const measuring = live.phase === 'download' || live.phase === 'upload'
  const gaugeValue = measuring ? live.mbps : running ? 0 : (result?.downloadMbps ?? 0)
  const gaugeLabel = running ? t(`speedtest.phase.${live.phase}`) : result ? t('speedtest.phase.done') : t('speedtest.phase.idle')

  // after a run the figures stay on screen; before the first run they are empty
  const shown: SpeedLive = running || !result
    ? live
    : {
        ...live,
        phase: 'done',
        downloadMbps: result.downloadMbps,
        uploadMbps: result.uploadMbps,
        latencyMs: result.latencyMs,
        jitterMs: result.jitterMs,
      }

  const delta = running || !result
    ? { download: null, upload: null }
    : { download: change(result.downloadMbps, previous?.downloadMbps), upload: change(result.uploadMbps, previous?.uploadMbps) }

  const displayServerName = result?.serverName || serverName || 'Cloudflare, Nearest edge'
  const displayHost = result?.server || hostText || 'speed.cloudflare.com'

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.8125rem] text-[var(--text-secondary)]">{description}</p>
        {displayHost ? (
          <span className="panel-mono inline-flex items-center gap-1.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-2.5 py-1 text-[0.6875rem] text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--panel-primary-text)]" />
            <span>{displayHost}</span>
          </span>
        ) : null}
      </div>

      {notice}

      <div className="grid gap-3.5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]" aria-live="off">
        <div className="speed-hero">
          <SpeedGauge
            value={gaugeValue}
            label={gaugeLabel}
            active={running && measuring}
            scaleKey={live.phase}
            tone={live.phase === 'upload' ? 'upload' : 'download'}
          />
          <SpeedSteps phase={shown.phase} upload={uploadAvailable} />

          <div className="speed-hero__server">
            <span className="text-[0.8125rem] font-semibold text-[var(--win-text)]">
              {displayServerName}
            </span>
            <span className="panel-mono text-[0.6875rem] text-[var(--text-secondary)]">
              {displayHost}
            </span>
          </div>
        </div>

        <SpeedStats live={shown} delta={delta} uploadAvailable={uploadAvailable} />
      </div>

      {!running && (result?.notes?.length || result?.downloadServer) ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--panel-warning-text)_25%,transparent)] bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem] text-[var(--panel-warning-text)]">
          <IconBadge size="sm" tone="warning">
            <TriangleAlert size={14} />
          </IconBadge>
          <div className="min-w-0 flex-1 space-y-1">
            {result.downloadServer ? <p>{t('speedtest.downloadFrom', { server: result.downloadServer })}</p> : null}
            {result.notes?.some((note) => note.includes('HTTP 429')) ? <p>{t('speedtest.rateLimited')}</p> : null}
            {result.notes?.map((note) => (
              <p key={note} className="panel-mono break-words text-[0.75rem]">{note}</p>
            ))}
          </div>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {running ? gaugeLabel : result ? t('speedtest.phase.done') : ''}
      </p>
    </section>
  )
}
