import { Check } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { SpeedPhase } from '@/api/speedtest'

const ORDER: SpeedPhase[] = ['ping', 'download', 'upload']

// Ping, download and upload as a row of steps: done, running, waiting
export function SpeedSteps({ phase }: { phase: SpeedPhase }) {
  const { t } = useI18n()
  const at = phase === 'done' ? ORDER.length : ORDER.indexOf(phase)
  return (
    <ol className="speed-steps" aria-label={t('speedtest.steps')}>
      {ORDER.map((step, index) => {
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
