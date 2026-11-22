import { ChevronDown } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { LegalLinks } from '@/pages/legal/LegalLinks'

// Number of questions in the locale files (landing.faq.q<n> and a<n>)
const QUESTIONS = Array.from({ length: 10 }, (_, i) => i + 1)

// Questions people ask before installing; each answer opens in place, and the first one starts open
export function Faq() {
  const { t } = useI18n()
  return (
    <section className="mt-14" aria-labelledby="landing-faq">
      <h2 id="landing-faq" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.faq.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.faq.subtitle')}</p>

      <div className="mt-4 divide-y divide-[var(--win-border)] border-y border-[var(--win-border)]">
        {QUESTIONS.map((n) => (
          <details key={n} className="group" open={n === 1 ? true : undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-[0.875rem] font-semibold transition-colors hover:text-[var(--panel-info-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
              <span>{t(`landing.faq.q${n}`)}</span>
              <ChevronDown size={15} className="shrink-0 text-[var(--text-secondary)] transition-transform group-open:rotate-180" />
            </summary>
            <p className="max-w-3xl pb-3.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`landing.faq.a${n}`)}</p>
          </details>
        ))}
      </div>

      <p className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">
        <LegalLinks messageKey="landing.faq.more" />
      </p>
    </section>
  )
}
