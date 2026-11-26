import { ArrowRight, Check } from 'lucide-react'
import type { StudioPage, StudioThemeTone } from '@/api/studio'
import { Badge } from '@/components/ui/Badge'

type PublicPage = Omit<StudioPage, 'id' | 'ownerUserId' | 'showInDocs' | 'linkedDocId' | 'sourcePrompt' | 'createdAt'>

const TONE_ACCENT: Record<StudioThemeTone, { badge: 'primary' | 'success' | 'neutral' | 'warning'; border: string; bg: string; text: string }> = {
  blue: {
    badge: 'primary',
    border: 'border-[var(--panel-primary-border)]',
    bg: 'bg-[var(--panel-primary-bg)]',
    text: 'text-[var(--panel-primary-text)]',
  },
  emerald: {
    badge: 'success',
    border: 'border-[var(--panel-success-border)]',
    bg: 'bg-[var(--panel-success-bg)]',
    text: 'text-[var(--panel-success-text)]',
  },
  slate: {
    badge: 'neutral',
    border: 'border-[var(--win-border)]',
    bg: 'bg-[var(--panel-surface-strong)]',
    text: 'text-[var(--win-text)]',
  },
  amber: {
    badge: 'warning',
    border: 'border-[var(--panel-warning-border)]',
    bg: 'bg-[var(--panel-warning-bg)]',
    text: 'text-[var(--panel-warning-text)]',
  },
}

export function PublicLandingView({
  page,
  t,
}: {
  page: PublicPage
  t: (key: string) => string
}) {
  const accent = TONE_ACCENT[page.themeTone] ?? TONE_ACCENT.blue
  const ctaHref = page.ctaUrl?.trim() || '#contact'
  const isExternalCta = /^https?:\/\//i.test(ctaHref)

  return (
    <div className="min-h-screen bg-[var(--win-content-bg)] text-[var(--win-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--win-border)] bg-[var(--win-bar)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="truncate text-sm font-bold tracking-tight text-[var(--win-text)]">
              {page.brandName || page.title}
            </span>
            {page.status !== 'published' ? (
              <Badge tone="warning" size="sm">{t('studio.previewBadge')}</Badge>
            ) : null}
          </div>
          {page.ctaLabel ? (
            <a
              href={ctaHref}
              target={isExternalCta ? '_blank' : undefined}
              rel={isExternalCta ? 'noopener noreferrer' : undefined}
              className="panel-btn panel-btn--primary !h-8 !px-3.5 text-xs font-semibold no-underline"
            >
              <span>{page.ctaLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-5 py-12 sm:py-16">
        <section className="max-w-3xl space-y-4">
          {page.brandName ? (
            <Badge tone={accent.badge} size="sm">{page.brandName}</Badge>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-[var(--win-text)] sm:text-4xl leading-tight">
            {page.title}
          </h1>
          {page.subtitle ? (
            <p className="text-base leading-relaxed text-[var(--text-secondary)]">
              {page.subtitle}
            </p>
          ) : null}
          {page.ctaLabel ? (
            <div className="pt-2">
              <a
                href={ctaHref}
                target={isExternalCta ? '_blank' : undefined}
                rel={isExternalCta ? 'noopener noreferrer' : undefined}
                className="panel-btn panel-btn--primary inline-flex !h-10 !px-5 text-sm font-semibold no-underline"
              >
                <span>{page.ctaLabel}</span>
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </div>
          ) : null}
        </section>

        {page.sections.map((sec) => (
          <section key={sec.id} id={sec.type} className="space-y-5 border-t border-[var(--win-border)] pt-10">
            <div className="max-w-2xl space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-[var(--win-text)] sm:text-2xl">
                {sec.heading}
              </h2>
              {sec.subheading ? (
                <p className="text-sm text-[var(--text-secondary)]">{sec.subheading}</p>
              ) : null}
            </div>

            {sec.type === 'pricing' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sec.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col justify-between rounded-xl border p-5 ${
                      item.highlight ? `${accent.border} ${accent.bg}` : 'border-[var(--win-border)] bg-[var(--win-bar)]'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-[var(--win-text)]">{item.title}</h3>
                        {item.badge ? <Badge tone={accent.badge} size="sm">{item.badge}</Badge> : null}
                      </div>
                      {item.price ? (
                        <div className="panel-mono text-2xl font-bold text-[var(--win-text)]">{item.price}</div>
                      ) : null}
                      {item.description ? (
                        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                      ) : null}
                      {item.bullets && item.bullets.length > 0 ? (
                        <ul className="space-y-1.5 pt-2 text-xs text-[var(--win-text)]">
                          {item.bullets.map((b, bIdx) => (
                            <li key={bIdx} className="flex items-start gap-2">
                              <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent.text}`} strokeWidth={2} />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : sec.type === 'faq' ? (
              <div className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--win-bar)]">
                {sec.items.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-[var(--win-text)]">{item.title}</h3>
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                  </div>
                ))}
              </div>
            ) : sec.type === 'steps' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {sec.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-[var(--win-border)] bg-[var(--win-bar)] p-5 space-y-2">
                    <span className={`panel-mono text-xs font-bold ${accent.text}`}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm font-semibold text-[var(--win-text)]">{item.title}</h3>
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sec.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-[var(--win-border)] bg-[var(--win-bar)] p-5 space-y-1.5">
                    <h3 className="text-sm font-semibold text-[var(--win-text)]">{item.title}</h3>
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        {page.ctaLabel ? (
          <section id="contact" className={`rounded-xl border p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${accent.border} ${accent.bg}`}>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[var(--win-text)]">{page.title}</h2>
              {page.seoDescription ? (
                <p className="text-xs text-[var(--text-secondary)]">{page.seoDescription}</p>
              ) : null}
            </div>
            <a
              href={ctaHref}
              target={isExternalCta ? '_blank' : undefined}
              rel={isExternalCta ? 'noopener noreferrer' : undefined}
              className="panel-btn panel-btn--primary shrink-0 !h-10 !px-5 text-sm font-semibold no-underline"
            >
              <span>{page.ctaLabel}</span>
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </a>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-[var(--win-border)] py-6 text-center text-xs text-[var(--text-secondary)]">
        {page.brandName || page.title}
      </footer>
    </div>
  )
}
