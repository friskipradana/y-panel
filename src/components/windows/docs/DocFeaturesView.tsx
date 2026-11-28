import { Bot, FileText, PenSquare } from 'lucide-react'
import type { DocFeatureCoverage } from '@/api/docs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import type { DocsWindowState } from './useDocsWindow'

function FeatureCard({ dw, feature }: { dw: DocsWindowState; feature: DocFeatureCoverage }) {
  const { t, isAdmin, openPost, openCreate, openAiFor } = dw
  const covered = feature.posts.length > 0
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[0.875rem] font-semibold">{feature.name}</h3>
        <Badge tone={covered ? 'success' : 'warning'} size="sm">
          {covered ? t('docs.features.count', { count: feature.posts.length }) : t('docs.features.none')}
        </Badge>
      </div>
      <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{feature.description}</p>
      {covered ? (
        <ul className="space-y-0.5">
          {feature.posts.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded text-left text-[0.8125rem] text-[var(--panel-primary-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                onClick={() => openPost(post)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 truncate">{post.title}</span>
                {post.status !== 'published' ? <span className="shrink-0 text-[0.75rem] text-[var(--text-secondary)]">{t(`docs.visibility.${post.status}`)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {isAdmin ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="outline" icon={<Bot className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => openAiFor(feature.key)}>
            {t('docs.features.generate')}
          </Button>
          <Button size="sm" variant="ghost" icon={<PenSquare className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => openCreate(feature.key)}>
            {t('docs.features.write')}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

// Every Reneo feature and the posts that explain it, so what is still undocumented is visible
export function DocFeaturesView({ dw }: { dw: DocsWindowState }) {
  const { t, features, featuresQuery, list } = dw
  if (featuresQuery.isLoading) return <LoadingState>{t('docs.loading')}</LoadingState>
  if (featuresQuery.isError) return <ErrorState title={t('docs.loadFailed')} hint={(featuresQuery.error as Error).message} />

  const q = list.text.trim().toLowerCase()
  const shown = features.filter((f) => !q || `${f.name} ${f.description}`.toLowerCase().includes(q))
  const covered = features.filter((f) => f.posts.length > 0).length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <p className="mb-3 text-[0.8125rem] text-[var(--text-secondary)]">{t('docs.features.summary', { covered, total: features.length })}</p>
      {shown.length === 0 ? (
        <EmptyState icon={<FileText />}>{t('docs.noMatch')}</EmptyState>
      ) : (
        <ul className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {shown.map((feature) => (
            <FeatureCard key={feature.key} dw={dw} feature={feature} />
          ))}
        </ul>
      )}
    </div>
  )
}
