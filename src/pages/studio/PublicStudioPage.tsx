import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Link2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { getPublicStudioPage } from '@/api/studio'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { Markdown } from '@/lib/markdown'
import { PublicLandingView } from './PublicLandingView'

function extractHeadings(markdown: string): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = []
  for (const line of markdown.split('\n')) {
    const m = /^(#{2,3})\s+(.+)$/.exec(line.trim())
    if (m) out.push({ level: m[1].length, text: m[2].trim() })
  }
  return out
}

export function PublicStudioPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const preview = searchParams.get('preview') === '1'
  const { t } = useI18n()

  const q = useQuery({
    queryKey: ['public-studio-page', slug, preview],
    queryFn: () => getPublicStudioPage(slug, preview),
    enabled: Boolean(slug),
    retry: false,
  })

  const page = q.data?.page
  const headings = useMemo(() => (page?.kind === 'docs' ? extractHeadings(page.markdownBody) : []), [page])

  useEffect(() => {
    if (!page) return
    document.title = page.brandName ? `${page.title} · ${page.brandName}` : page.title
    const metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc && page.seoDescription) metaDesc.setAttribute('content', page.seoDescription)
  }, [page])

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--win-content-bg)] p-6">
        <LoadingState>{t('common.loading')}</LoadingState>
      </div>
    )
  }

  if (q.isError || !page) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--win-content-bg)] p-6">
        <ErrorState title={t('studio.publicNotFound')} hint={t('studio.publicNotFoundHint')} />
      </div>
    )
  }

  if (page.kind === 'landing') {
    return <PublicLandingView page={page} t={t} />
  }

  return (
    <div className="min-h-screen bg-[var(--win-content-bg)] text-[var(--win-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--win-border)] bg-[var(--win-bar)] print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 shrink-0 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
            <span className="truncate text-sm font-semibold">{page.brandName || t('studio.kind.docs')}</span>
            {page.status !== 'published' ? <Badge tone="warning" size="sm">{t('studio.previewBadge')}</Badge> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => toast.success(t('studio.urlCopied')))}
            >
              {t('studio.copyUrl')}
            </Button>
            <Button size="sm" variant="outline" icon={<Printer className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => window.print()}>
              {t('devdesk.printPdf')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="min-w-0 rounded-xl border border-[var(--win-border)] bg-[var(--win-bar)] p-6 sm:p-8 print:border-none print:p-0">
          <header className="space-y-2 border-b border-[var(--win-border)] pb-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Badge tone="info" size="sm">{t('studio.kind.docs')}</Badge>
              <span className="panel-mono">/p/{page.slug}</span>
              {page.updatedAt ? <span>· {formatDateID(page.updatedAt)}</span> : null}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--win-text)] sm:text-3xl">{page.title}</h1>
            {page.subtitle ? <p className="text-sm text-[var(--text-secondary)]">{page.subtitle}</p> : null}
          </header>
          <Markdown source={page.markdownBody} className="mt-6" />
        </article>

        {headings.length > 0 ? (
          <aside className="hidden lg:block print:hidden">
            <div className="sticky top-20 space-y-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                {t('studio.tocHeading')}
              </div>
              <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                {headings.map((h, i) => (
                  <li key={i} className={h.level === 3 ? 'pl-3' : 'font-medium text-[var(--win-text)]'}>
                    {h.text}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}
      </main>
    </div>
  )
}
