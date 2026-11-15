import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const STEPS = ['problem', 'origin', 'chance', 'reach'] as const
type StepId = (typeof STEPS)[number]

// Why Reneo exists, in four interactive roadmap milestones: click a milestone node to reveal its story
export function Background() {
  const { t } = useI18n()
  const [activeId, setActiveId] = useState<StepId | null>(null)
  const steps = STEPS.map((id, index) => ({
    id,
    num: String(index + 1).padStart(2, '0'),
    title: id === 'chance' ? t('landing.tagline') : t(`landing.background.${id}.title`),
    desc: t(`landing.background.${id}.desc`),
    accent: id === 'chance',
  }))
  const activeStep = steps.find((step) => step.id === activeId) ?? null
  const toggle = (id: StepId) => setActiveId((prev) => (prev === id ? null : id))

  return (
    <section className="mt-14" aria-labelledby="landing-background">
      <h2 id="landing-background" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.background.title')}
      </h2>
      <p className="mt-1 max-w-2xl text-[0.875rem] text-[var(--text-secondary)]">
        {t('landing.background.subtitle')}
      </p>

      {/* Mobile: Vertical Interactive Roadmap */}
      <ol className="relative mt-6 space-y-3 pl-9 md:hidden">
        <div
          aria-hidden="true"
          className="absolute bottom-5 left-[13px] top-4 w-[2px] bg-[var(--win-border)]"
        />
        {steps.map((step) => {
          const isOpen = activeId === step.id
          return (
            <li key={step.id} className="relative">
              <span
                className={`panel-mono absolute -left-9 top-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold shadow-2xs transition-colors ${
                  isOpen || step.accent
                    ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-solid)] text-white'
                    : 'border-[var(--win-border)] bg-[var(--win-content-bg)] text-[var(--win-text)]'
                }`}
              >
                {step.num}
              </span>
              <div
                className={`rounded-2xl border shadow-2xs backdrop-blur-xs transition-colors ${
                  isOpen
                    ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)]'
                    : 'border-[var(--win-border)] bg-[var(--panel-surface)]/50 hover:bg-[var(--panel-surface)]/80'
                }`}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(step.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span
                    className={`text-[0.875rem] font-bold leading-snug tracking-tight ${
                      isOpen || step.accent ? 'text-[var(--panel-primary-text)]' : 'text-[var(--win-text)]'
                    }`}
                  >
                    {step.title}
                  </span>
                  <ChevronDown
                    size={16}
                    strokeWidth={1.75}
                    className={`shrink-0 text-[var(--text-secondary)] transition-transform ${
                      isOpen ? 'rotate-180 text-[var(--panel-primary-text)]' : ''
                    }`}
                  />
                </button>
                {isOpen ? (
                  <p className="border-t border-[var(--win-border)] px-4 pb-3.5 pt-2.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {step.desc}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Desktop: Horizontal 4-Milestone Interactive Roadmap */}
      <div className="relative mt-6 hidden md:block">
        <div
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-3.5 h-[2px] bg-[var(--win-border)]"
        />
        <ol className="relative grid grid-cols-4 gap-3.5">
          {steps.map((step) => {
            const isOpen = activeId === step.id
            return (
              <li key={step.id} className="flex flex-col items-center">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(step.id)}
                  className="group flex w-full flex-col items-center focus:outline-none"
                >
                  <span
                    className={`panel-mono relative z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold shadow-2xs transition-colors ${
                      isOpen || step.accent
                        ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-solid)] text-white'
                        : 'border-[var(--win-border)] bg-[var(--win-content-bg)] text-[var(--win-text)] group-hover:border-[var(--panel-primary-solid)]'
                    }`}
                  >
                    {step.num}
                  </span>
                  <div
                    className={`mt-3 w-full rounded-2xl border px-3.5 py-3 text-left shadow-2xs backdrop-blur-xs transition-colors ${
                      isOpen
                        ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)]'
                        : 'border-[var(--win-border)] bg-[var(--panel-surface)]/50 group-hover:border-[var(--panel-primary-solid)] group-hover:bg-[var(--panel-surface)]/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={`text-[0.875rem] font-bold leading-snug tracking-tight ${
                          isOpen || step.accent ? 'text-[var(--panel-primary-text)]' : 'text-[var(--win-text)]'
                        }`}
                      >
                        {step.title}
                      </h3>
                      <ChevronDown
                        size={15}
                        strokeWidth={1.75}
                        className={`mt-0.5 shrink-0 text-[var(--text-secondary)] transition-transform ${
                          isOpen ? 'rotate-180 text-[var(--panel-primary-text)]' : ''
                        }`}
                      />
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ol>

        {activeStep ? (
          <div className="mt-3.5 rounded-2xl border border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] p-4 shadow-2xs backdrop-blur-xs">
            <div className="flex items-center gap-2.5">
              <span className="panel-mono inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--panel-primary-solid)] px-2 text-[0.75rem] font-bold text-white">
                {activeStep.num}
              </span>
              <h3 className="text-[0.875rem] font-bold tracking-tight text-[var(--panel-primary-text)]">
                {activeStep.title}
              </h3>
            </div>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--win-text)]">
              {activeStep.desc}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
