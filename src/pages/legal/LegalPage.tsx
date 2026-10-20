import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PublicShell } from '@/components/public/PublicShell'
import { Button } from '@/components/ui/Button'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useI18n } from '@/lib/i18n'

export type LegalKind = 'terms' | 'privacy'

// How many sections each document has in the locale files (legal.<kind>.s<n>.title and .body)
const SECTION_COUNT: Record<LegalKind, number> = { terms: 12, privacy: 9 }

// Date of the last change to the text of either document
const LEGAL_UPDATED = '2026-10-20'

// A paragraph, or a list when every line of the block starts with "- "
function LegalBody({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
      {text.split('\n\n').map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((line) => line.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-[var(--text-secondary)]">
              {lines.map((line) => (
                <li key={line}>{line.slice(2)}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{block}</p>
      })}
    </div>
  )
}

// The terms and the privacy policy: one page layout, the text comes from the locale files
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  usePageMeta(`${t(`legal.${kind}.title`)} | Reneo`, t(`legal.${kind}.subtitle`))

  const sections = Array.from({ length: SECTION_COUNT[kind] }, (_, i) => i + 1)
  const updated = new Date(LEGAL_UPDATED).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' })

  const toc = (
    <ol className="space-y-1 text-[0.8125rem]">
      {sections.map((n) => (
        <li key={n} className="grid grid-cols-[1.5rem_1fr] gap-1">
          <span className="panel-mono text-[var(--text-secondary)]">{n}</span>
          <a
            href={`#${kind}-${n}`}
            className="text-[var(--text-secondary)] hover:text-[var(--win-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {t(`legal.${kind}.s${n}.title`)}
          </a>
        </li>
      ))}
    </ol>
  )

  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-3 sm:px-6 sm:pt-8">
        <Button variant="ghost" className="-ml-2.5" onClick={() => navigate('/')}>
          <ArrowLeft size={13} />
          <span>{t('legal.back')}</span>
        </Button>

        <header className="mt-4">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t(`legal.${kind}.title`)}</h1>
          <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t(`legal.${kind}.subtitle`)}</p>
          <p className="panel-mono mt-2 text-[0.75rem] text-[var(--text-secondary)]">{t('legal.updated', { date: updated })}</p>
        </header>

        <p className="mt-5 max-w-3xl border-l-2 border-[var(--win-border)] pl-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          {t('legal.notice')}
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
          <nav aria-label={t('legal.toc')} className="lg:sticky lg:top-20 lg:self-start">
            <details className="border-y border-[var(--win-border)] py-2.5 lg:hidden">
              <summary className="cursor-pointer text-[0.8125rem] font-semibold">{t('legal.toc')}</summary>
              <div className="mt-2">{toc}</div>
            </details>
            <div className="hidden lg:block">
              <p className="panel-mono mb-2 text-[0.75rem] uppercase tracking-widest text-[var(--text-secondary)]">{t('legal.toc')}</p>
              {toc}
            </div>
          </nav>

          <article className="min-w-0 max-w-3xl space-y-8">
            {sections.map((n) => (
              <section key={n} id={`${kind}-${n}`} aria-labelledby={`${kind}-${n}-title`} className="scroll-mt-20">
                <h2 id={`${kind}-${n}-title`} className="mb-2 flex gap-3 text-lg font-bold tracking-tight">
                  <span className="panel-mono w-6 shrink-0 text-[0.875rem] font-semibold leading-7 text-[var(--panel-info-text)]">{n}</span>
                  <span>{t(`legal.${kind}.s${n}.title`)}</span>
                </h2>
                <div className="pl-9">
                  <LegalBody text={t(`legal.${kind}.s${n}.body`)} />
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
    </PublicShell>
  )
}
