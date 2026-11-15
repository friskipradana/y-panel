import { useI18n } from '@/lib/i18n'

const STEPS = ['problem', 'origin', 'chance', 'reach'] as const

// Why Reneo exists, in four steps: the idle server, the panel that does not hide Linux, the tagline, and where it runs
export function Background() {
  const { t } = useI18n()
  const steps = STEPS.map((id, index) => ({
    id,
    num: String(index + 1).padStart(2, '0'),
    title: id === 'chance' ? t('landing.tagline') : t(`landing.background.${id}.title`),
    desc: t(`landing.background.${id}.desc`),
    accent: id === 'chance',
  }))

  return (
    <section className="mt-14" aria-labelledby="landing-background">
      <h2 id="landing-background" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.background.title')}
      </h2>
      <p className="mt-1 max-w-2xl text-[0.875rem] text-[var(--text-secondary)]">
        {t('landing.background.subtitle')}
      </p>

      <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`rounded-[14px] border p-4 sm:p-5 ${
              step.accent
                ? 'border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)]/50'
                : 'border-[var(--win-border)] bg-[var(--panel-surface)]'
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`panel-mono inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[0.75rem] font-semibold ${
                  step.accent
                    ? 'border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]'
                    : 'border-[var(--win-border)] bg-[var(--win-content-bg)] text-[var(--text-secondary)]'
                }`}
              >
                {step.num}
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-[0.9375rem] font-bold tracking-tight text-[var(--win-text)]">
                  {step.title}
                </h3>
                <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {step.desc}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
