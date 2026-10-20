import { useI18n } from '@/lib/i18n'
import { LandingSteps } from '@/pages/landing/LandingSteps'

const PARTS = ['rein', 'neo', 'rene'] as const

// The name in three steps: Re, Neo and "rene o", each with what it means for the panel
export function Philosophy() {
  const { t } = useI18n()
  const steps = PARTS.map((id) => ({
    id,
    label: t(`landing.philosophy.${id}.tag`),
    title: t(`landing.philosophy.${id}.title`),
    desc: t(`landing.philosophy.${id}.desc`),
  }))
  return (
    <section className="mt-14" aria-labelledby="landing-philosophy">
      <h2 id="landing-philosophy" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.philosophy.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.philosophy.subtitle')}</p>
      <p className="panel-mono mt-1 text-[0.75rem] text-[var(--text-secondary)]">{t('landing.hero.name')}</p>
      <LandingSteps steps={steps} label={t('landing.philosophy.title')} />
    </section>
  )
}
