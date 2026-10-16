import { Gauge, Play, Square, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useI18n } from '@/lib/i18n'
import type { SpeedLive, SpeedResult } from '@/api/speedtest'
import { SpeedGauge } from './SpeedGauge'
import { SpeedStats } from './SpeedStats'
import { SpeedSteps } from './SpeedSteps'

interface SpeedPanelProps {
  title: string
  subtitle: string
  live: SpeedLive
  result: SpeedResult | null
  running: boolean
  onStart: () => void
  onStop: () => void
}

// One test: meter and steps on the left, the four figures on the right, all live
export function SpeedPanel({ title, subtitle, live, result, running, onStart, onStop }: SpeedPanelProps) {
  const { t } = useI18n()
  const measuring = live.phase === 'download' || live.phase === 'upload'
  const gaugeValue = measuring ? live.mbps : running ? 0 : (result?.downloadMbps ?? 0)
  const gaugeLabel = running ? t(`speedtest.phase.${live.phase}`) : result ? t('speedtest.phase.done') : t('speedtest.phase.idle')
  // after a run the figures stay on screen; before the first run they are empty
  const shown: SpeedLive = running || !result ? live : { ...live, phase: 'done', downloadMbps: result.downloadMbps, uploadMbps: result.uploadMbps, latencyMs: result.latencyMs, jitterMs: result.jitterMs }

  return (
    <div className="panel-shell-card space-y-4 p-4">
      <SectionHeader
        icon={<Gauge />}
        title={title}
        subtitle={subtitle}
        actions={
          running ? (
            <Button variant="danger-soft" icon={<Square className="h-3.5 w-3.5" />} onClick={onStop}>
              {t('speedtest.stop')}
            </Button>
          ) : (
            <Button variant="primary" icon={<Play className="h-3.5 w-3.5" />} onClick={onStart}>
              {result ? t('speedtest.again') : t('speedtest.start')}
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]" aria-live="off">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
          <SpeedGauge value={gaugeValue} label={gaugeLabel} active={running && measuring} scaleKey={live.phase} />
          <SpeedSteps phase={shown.phase} />
        </div>
        <SpeedStats live={shown} />
      </div>

      {!running && (result?.notes?.length || result?.downloadServer) ? (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--panel-warning-text)]/40 bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem] text-[var(--panel-warning-text)]">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0 space-y-1">
            {result.downloadServer ? <p>{t('speedtest.downloadFrom', { server: result.downloadServer })}</p> : null}
            {result.notes?.map((note) => (
              <p key={note} className="panel-mono break-words text-[0.75rem]">{note}</p>
            ))}
          </div>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {running ? gaugeLabel : result ? t('speedtest.phase.done') : ''}
      </p>
    </div>
  )
}
