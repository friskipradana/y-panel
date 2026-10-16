import { Gauge, LoaderCircle, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useI18n } from '@/lib/i18n'
import type { BrowserSpeedResult, SpeedProgress } from '@/api/speedtest'
import { SpeedStats } from './SpeedReadout'

interface SpeedPanelProps {
  title: string
  subtitle: string
  result: BrowserSpeedResult | null
  progress?: SpeedProgress
  running: boolean
  onStart: () => void
  onStop?: () => void
  /** Teks saat tidak ada angka bergerak (tes server tidak punya progres) */
  busyHint?: string
}

// One test card: live number and bar while running, the four figures afterwards
export function SpeedPanel({ title, subtitle, result, progress, running, onStart, onStop, busyHint }: SpeedPanelProps) {
  const { t } = useI18n()
  const phase = progress?.phase ?? 'idle'
  const live = phase === 'download' || phase === 'upload'
  const percent = progress ? Math.round(progress.fraction * 100) : 0
  const phaseLabel = phase === 'ping' ? t('speedtest.phase.ping') : phase === 'download' ? t('speedtest.phase.download') : phase === 'upload' ? t('speedtest.phase.upload') : ''

  return (
    <div className="panel-shell-card space-y-4 p-4">
      <SectionHeader
        icon={<Gauge />}
        title={title}
        subtitle={subtitle}
        actions={
          running && onStop ? (
            <Button variant="danger-soft" icon={<Square className="h-3.5 w-3.5" />} onClick={onStop}>
              {t('speedtest.stop')}
            </Button>
          ) : (
            <Button variant="primary" loading={running} icon={<Play className="h-3.5 w-3.5" />} onClick={onStart}>
              {result ? t('speedtest.again') : t('speedtest.start')}
            </Button>
          )
        }
      />

      {running ? (
        <div className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
              <LoaderCircle size={14} className="animate-spin" />
              {phaseLabel || busyHint}
            </span>
            {live ? (
              <span className="panel-mono text-[1.75rem] font-semibold leading-none">
                {(progress?.mbps ?? 0).toFixed(1)} <span className="text-[0.8125rem] font-normal text-[var(--text-secondary)]">Mbps</span>
              </span>
            ) : null}
          </div>
          {progress ? (
            <div className="panel-progress mt-3" role="progressbar" aria-label={phaseLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className="panel-progress__bar" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      <SpeedStats result={result} />
    </div>
  )
}
