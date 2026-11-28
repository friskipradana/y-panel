import { ArrowRight, Check, Quote } from 'lucide-react'
import type { StudioPage, StudioThemeTone } from '@/api/studio'
import { Badge } from '@/components/ui/Badge'

export type PublicLandingPageData = Pick<
  StudioPage,
  'title' | 'subtitle' | 'status' | 'brandName' | 'themeTone' | 'seoDescription' | 'ctaLabel' | 'ctaUrl' | 'sections'
>

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
  embedded = false,
}: {
  page: PublicLandingPageData
  t: (key: string) => string
  embedded?: boolean
}) {
  const accent = TONE_ACCENT[page.themeTone] ?? TONE_ACCENT.blue
  const ctaHref = page.ctaUrl?.trim() || '#contact'
  const isExternalCta = /^https?:\/\//i.test(ctaHref)

  const ctaLinkProps = embedded
    ? { href: '#preview-cta', onClick: (e: React.MouseEvent) => e.preventDefault() }
    : {
        href: ctaHref,
        target: isExternalCta ? '_blank' : undefined,
        rel: isExternalCta ? 'noopener noreferrer' : undefined,
      }

  return (
    <div className={`${embedded ? 'min-h-full' : 'min-h-screen'} bg-[var(--win-content-bg)] text-[var(--win-text)]`}>
      <header className="sticky top-0 z-10 border-b border-[var(--win-border)] bg-[var(--win-bar)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="truncate text-sm font-bold tracking-tight text-[var(--win-text)]">
              {page.brandName || page.title}
            </span>
            {!embedded && page.status !== 'published' ? (
              <Badge tone="warning" size="sm">{t('studio.previewBadge')}</Badge>
            ) : null}
          </div>
          {page.ctaLabel ? (
            <a
              {...ctaLinkProps}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--panel-primary-solid)] px-3.5 text-xs font-semibold text-[var(--panel-primary-contrast)] no-underline transition-opacity hover:opacity-90"
            >
              <span>{page.ctaLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-5 py-10 sm:py-14">
        <section className="max-w-3xl space-y-4">
          {page.brandName ? <Badge tone={accent.badge} size="sm">{page.brandName}</Badge> : null}
          <h1 className="text-3xl font-bold tracking-tight text-[var(--win-text)] sm:text-4xl leading-tight">
            {page.title}
          </h1>
          {page.subtitle ? (
            <p className="text-base leading-relaxed text-[var(--text-secondary)]">{page.subtitle}</p>
          ) : null}
          {page.ctaLabel ? (
            <div className="pt-2">
              <a
                {...ctaLinkProps}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--panel-primary-solid)] px-5 text-sm font-semibold text-[var(--panel-primary-contrast)] no-underline transition-opacity hover:opacity-90"
              >
                <span>{page.ctaLabel}</span>
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </div>
          ) : null}
        </section>

        {page.sections.map((sec) => (
          <section key={sec.id} id={sec.type} className="space-y-5 border-t border-[var(--win-border)] pt-9">
            <div className="max-w-2xl space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-[var(--win-text)] sm:text-2xl">
                {sec.heading}
              </h2>
              {sec.subheading ? <p className="text-sm text-[var(--text-secondary)]">{sec.subheading}</p> : null}
            </div>

            {sec.type === 'stats' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {sec.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-[var(--win-border)] bg-[var(--win-bar)] p-4 space-y-1">
                    <div className={`panel-mono text-2xl font-bold ${accent.text}`}>{item.title}</div>
                    <p className="text-xs text-[var(--text-secondary)]">{item.description}</p>
                  </div>
                ))}
              </div>
            ) : sec.type === 'pricing' ? (
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
                      {item.price ? <div className="panel-mono text-2xl font-bold text-[var(--win-text)]">{item.price}</div> : null}
                      {item.description ? <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{item.description}</p> : null}
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
            ) : sec.type === 'testimonials' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sec.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-[var(--win-border)] bg-[var(--win-bar)] p-5 space-y-3">
                    <Quote className={`h-4 w-4 ${accent.text}`} strokeWidth={1.75} />
                    <p className="text-xs leading-relaxed text-[var(--win-text)]">{item.description}</p>
                    <div className="pt-1 border-t border-[var(--win-border)]">
                      <div className="text-xs font-semibold text-[var(--win-text)]">{item.title}</div>
                      {item.badge ? <div className="text-[11px] text-[var(--text-secondary)]">{item.badge}</div> : null}
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
              {page.seoDescription ? <p className="text-xs text-[var(--text-secondary)]">{page.seoDescription}</p> : null}
            </div>
            <a
              {...ctaLinkProps}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--panel-primary-solid)] px-5 text-sm font-semibold text-[var(--panel-primary-contrast)] no-underline transition-opacity hover:opacity-90"
            >
              <span>{page.ctaLabel}</span>
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </a>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-[var(--win-border)] py-5 text-center text-xs text-[var(--text-secondary)]">
        {page.brandName || page.title}
      </footer>
    </div>
  )
}
