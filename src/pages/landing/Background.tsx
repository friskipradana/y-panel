import { useI18n } from '@/lib/i18n'
import { LandingSteps } from '@/pages/landing/LandingSteps'

const STEPS = ['problem', 'origin', 'chance', 'reach'] as const

// Why Reneo exists, in four steps: the idle server, the panel that does not hide Linux, the tagline, and where it runs
export function Background() {
  const { t } = useI18n()
  const steps = STEPS.map((id) => ({
    id,
    title: id === 'chance' ? t('landing.tagline') : t(`landing.background.${id}.title`),
    desc: t(`landing.background.${id}.desc`),
    accent: id === 'chance',
  }))
  return (
    <section className="mt-14" aria-labelledby="landing-background">
      <h2 id="landing-background" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.background.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.background.subtitle')}</p>
      <LandingSteps steps={steps} label={t('landing.background.title')} />
    </section>
  )
}
