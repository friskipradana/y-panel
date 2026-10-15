import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { getPublicDoc, listPublicDocs } from '@/api/agent'
import { PublicShell } from '@/components/public/PublicShell'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { Markdown } from '@/lib/markdown'
import { usePageMeta } from '@/hooks/usePageMeta'

// Public article index: published docs marked public, readable without a session
export function ArticlesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['public-docs'], queryFn: listPublicDocs, staleTime: 60_000 })
  const items = query.data ?? []
  usePageMeta(`${t('articles.title')} | Reneo`, t('articles.subtitle'))

  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('articles.title')}</h1>
          <p className="text-[0.9375rem] text-[var(--text-secondary)]">{t('articles.subtitle')}</p>
        </header>

        <div className="mt-8">
          {query.isLoading ? (
            <LoadingState>{t('articles.loading')}</LoadingState>
          ) : query.isError ? (
            <ErrorState title={t('articles.loadFailed')} hint={t('articles.loadFailedHint')} />
          ) : items.length === 0 ? (
            <EmptyState icon={<BookOpen />}>{t('articles.empty')}</EmptyState>
          ) : (
            <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
              {items.map((item) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    onClick={() => navigate(`/articles/${item.slug}`)}
                    className="block w-full px-4 py-4 text-left transition-colors hover:bg-[var(--panel-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]"
                  >
                    <span className="block text-[0.9375rem] font-semibold">{item.title}</span>
                    {item.excerpt ? (
                      <span className="mt-1 block text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{item.excerpt}</span>
                    ) : null}
                    <span className="mt-2 block text-[0.75rem] text-[var(--text-secondary)]">{formatDateID(item.updatedAt)}</span>
                  </button>
                </li>
              ))}
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
  usePageMeta(doc ? `${doc.title} | Reneo` : 'Reneo', doc?.excerpt)

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
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{doc.title}</h1>
              <p className="mt-2 text-[0.75rem] text-[var(--text-secondary)]">{formatDateID(doc.updatedAt)}</p>
              <Markdown source={doc.content} className="mt-6 text-[0.9375rem]" />
            </article>
          )}
        </div>
      </main>
    </PublicShell>
  )
}
