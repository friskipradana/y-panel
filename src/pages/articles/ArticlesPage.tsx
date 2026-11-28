import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { getPublicDoc, listPublicDocs, type DocKind } from '@/api/agent'
import { PublicShell } from '@/components/public/PublicShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { Markdown, resolveImageSrc } from '@/lib/markdown'
import { usePageMeta } from '@/hooks/usePageMeta'

type PublicKindTab = 'all' | DocKind

// Public article & documentation index: published posts marked public, readable without a session
export function ArticlesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [kindTab, setKindTab] = useState<PublicKindTab>('all')
  const query = useQuery({ queryKey: ['public-docs'], queryFn: listPublicDocs, staleTime: 60_000 })
  const allItems = query.data ?? []
  const items = kindTab === 'all' ? allItems : allItems.filter((it) => (it.kind === 'doc' ? 'doc' : 'article') === kindTab)
  usePageMeta(`${t('articles.title')} | Reneo Panel`, t('articles.subtitle'))

  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('articles.title')}</h1>
            <p className="text-[0.9375rem] text-[var(--text-secondary)]">{t('articles.subtitle')}</p>
          </div>
          {allItems.length > 0 ? (
            <Tabs
              label={t('docs.fieldKind')}
              value={kindTab}
              onChange={(v) => setKindTab(v as PublicKindTab)}
              items={[
                { key: 'all', label: t('docs.kind.all') },
                { key: 'doc', label: t('docs.kind.doc') },
                { key: 'article', label: t('docs.kind.article') },
              ]}
            />
          ) : null}
        </header>

        <div className="mt-8">
          {query.isLoading ? (
            <LoadingState>{t('articles.loading')}</LoadingState>
          ) : query.isError ? (
            <ErrorState title={t('articles.loadFailed')} hint={t('articles.loadFailedHint')} />
          ) : items.length === 0 ? (
            <EmptyState icon={<BookOpen />}>{t('articles.empty')}</EmptyState>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const cover = item.cover ? resolveImageSrc(item.cover) : null
                const kind: DocKind = item.kind === 'doc' ? 'doc' : 'article'
                return (
                  <li key={item.slug} className="flex">
                    <a
                      href={`/articles/${item.slug}`}
                      onClick={(e) => {
                        e.preventDefault()
                        navigate(`/articles/${item.slug}`)
                      }}
                      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] transition-colors hover:border-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      <div className="aspect-[16/9] w-full overflow-hidden border-b border-[var(--win-border)] bg-[var(--panel-surface-strong)]">
                        {cover ? (
                          <img src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-[var(--text-secondary)]">
                            <BookOpen size={28} aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="mb-1.5">
                          <Badge tone={kind === 'doc' ? 'info' : 'neutral'} size="sm">{t(`docs.kind.${kind}`)}</Badge>
                        </div>
                        <h2 className="text-[0.9375rem] font-semibold leading-snug group-hover:underline">{item.title}</h2>
                        {item.excerpt ? (
                          <p className="mt-1.5 line-clamp-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{item.excerpt}</p>
                        ) : null}
                        <span className="mt-auto pt-3 text-[0.75rem] text-[var(--text-secondary)]">{formatDateID(item.updatedAt)}</span>
                      </div>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </PublicShell>
  )
}

export function ArticlePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { slug = '' } = useParams()
  const query = useQuery({ queryKey: ['public-doc', slug], queryFn: () => getPublicDoc(slug), retry: false, staleTime: 60_000 })
  const doc = query.data
  usePageMeta(doc ? `${doc.title} | Reneo Panel` : 'Reneo Panel', doc?.excerpt)

  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button variant="ghost" onClick={() => navigate('/articles')}>
          <ArrowLeft size={13} />
          <span>{t('articles.back')}</span>
        </Button>

        <div className="mt-6">
          {query.isLoading ? (
            <LoadingState>{t('articles.loading')}</LoadingState>
          ) : query.isError || !doc ? (
            <ErrorState title={t('articles.notFound')} hint={t('articles.notFoundHint')} />
          ) : (
            <article>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={doc.kind === 'doc' ? 'info' : 'neutral'} size="sm">
                  {t(`docs.kind.${doc.kind === 'doc' ? 'doc' : 'article'}`)}
                </Badge>
                <span className="text-[0.75rem] text-[var(--text-secondary)]">{formatDateID(doc.updatedAt)}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{doc.title}</h1>
              <Markdown source={doc.content} className="mt-6 text-[0.9375rem]" />
            </article>
          )}
        </div>
      </main>
    </PublicShell>
  )
}
