import { useI18n } from '@/lib/i18n'

const STEPS = ['problem', 'origin', 'chance', 'reach'] as const

// Why Reneo exists, in four roadmap milestones: the idle server, the panel that does not hide Linux, the tagline, and where it runs
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

      {/* Mobile: Vertical Roadmap */}
      <ol className="relative mt-6 space-y-4 pl-9 md:hidden">
        <div
          aria-hidden="true"
          className="absolute bottom-5 left-[13px] top-4 w-[2px] bg-[var(--win-border)]"
        />
        {steps.map((step) => (
          <li key={step.id} className="relative">
            <span
              className={`panel-mono absolute -left-9 top-3.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold shadow-2xs ${
                step.accent
                  ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-solid)] text-white'
                  : 'border-[var(--win-border)] bg-[var(--win-content-bg)] text-[var(--win-text)]'
              }`}
            >
              {step.num}
            </span>
            <div
              className={`rounded-2xl border p-4 shadow-2xs backdrop-blur-xs transition-colors ${
                step.accent
                  ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)]'
                  : 'border-[var(--win-border)] bg-[var(--panel-surface)]/50 hover:bg-[var(--panel-surface)]/80'
              }`}
            >
              <h3
                className={`text-[0.875rem] font-bold leading-snug tracking-tight ${
                  step.accent ? 'text-[var(--panel-primary-text)]' : 'text-[var(--win-text)]'
                }`}
              >
                {step.title}
              </h3>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                {step.desc}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Desktop: Horizontal 4-Milestone Roadmap */}
      <div className="relative mt-6 hidden md:block">
        <div
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-3.5 h-[2px] bg-[var(--win-border)]"
        />
        <ol className="relative grid grid-cols-4 gap-4">
          {steps.map((step) => (
            <li key={step.id} className="flex flex-col items-center">
              <span
                className={`panel-mono relative z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold shadow-2xs ${
                  step.accent
                    ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-solid)] text-white'
                    : 'border-[var(--win-border)] bg-[var(--win-content-bg)] text-[var(--win-text)]'
                }`}
              >
                {step.num}
              </span>
              <div
                className={`mt-4 w-full flex-1 rounded-2xl border p-4 shadow-2xs backdrop-blur-xs transition-colors ${
                  step.accent
                    ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)]'
                    : 'border-[var(--win-border)] bg-[var(--panel-surface)]/50 hover:bg-[var(--panel-surface)]/80'
                }`}
              >
                <h3
                  className={`text-[0.875rem] font-bold leading-snug tracking-tight ${
                    step.accent ? 'text-[var(--panel-primary-text)]' : 'text-[var(--win-text)]'
                  }`}
                >
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {step.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
