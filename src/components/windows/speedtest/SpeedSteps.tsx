import { Check } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { SpeedPhase } from '@/api/speedtest'

const ORDER: SpeedPhase[] = ['ping', 'download', 'upload']

// Ping, download and upload as a row of steps: done, running, waiting. Upload is left out for
// servers that only serve downloads.
export function SpeedSteps({ phase, upload = true }: { phase: SpeedPhase; upload?: boolean }) {
  const { t } = useI18n()
  const steps = upload ? ORDER : ORDER.filter((step) => step !== 'upload')
  const at = phase === 'done' ? steps.length : steps.indexOf(phase)
  return (
    <ol className="speed-steps" aria-label={t('speedtest.steps')}>
      {steps.map((step, index) => {
        const state = index < at ? 'done' : index === at ? 'active' : 'wait'
        return (
          <li key={step} className={`speed-step speed-step--${state}`} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="speed-step__dot">{state === 'done' ? <Check size={10} strokeWidth={3} /> : null}</span>
            {t(`speedtest.step.${step}`)}
          </li>
        )
      })}
    </ol>
  )
}
