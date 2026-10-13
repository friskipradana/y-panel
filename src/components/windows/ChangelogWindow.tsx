import { useQuery } from '@tanstack/react-query'
import { RefreshCcw, TriangleAlert, Zap } from 'lucide-react'
import { getSystemChangelog } from '@/api/agent'
import type { ChangelogEntry } from '@/types'
import { formatDateID, formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'


function TimelineEntry({ item, isLast }: { item: ChangelogEntry; isLast: boolean }) {
  return (
    <article className="panel-timeline__item">
      <div className="panel-timeline__rail">
        <div className="panel-timeline__dot" />
        {!isLast ? <div className="panel-timeline__line" /> : null}
      </div>

      <div className="panel-timeline__content">
        <div className="panel-card p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">v{item.version}</Badge>
              <span className="panel-meta-line">{formatDateID(item.releasedAt)}</span>
            </div>
            <span className="panel-muted-block panel-mono rounded-[10px] px-3 py-2 text-[12px]">{formatDateTimeID(item.createdAt)}</span>
          </div>

          <h3 className="text-[15px] font-semibold leading-snug text-[var(--win-text)]">{item.title}</h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{item.summary}</p>
        </div>
      </div>
    </article>
  )
}

export function ChangelogWindow() {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['system-changelog'],
    queryFn: getSystemChangelog,
    refetchInterval: 15_000,
    retry: 1,
  })

  const items = query.data?.items ?? []

  return (
    <div className="panel-window">
      {/* ── Compact Toolbar ── */}
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--win-text)]">{t('changelog.title')}</span>
          <span>•</span>
          <span className="text-[var(--panel-primary-text)] font-medium">v2.0.0</span>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            id="changelog-refresh"
            type="button"
            onClick={() => void query.refetch()} label={t('changelog.refresh')}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">
              <Zap className="h-3 w-3" />
              {t('changelog.releaseNotes')}
            </div>
            <div className="panel-hero__title">{t('changelog.heroTitle')}</div>
            <p className="panel-hero__description">
              {t('changelog.heroDescription')}
            </p>
          </section>

          {query.isLoading ? (
            <LoadingState>{t('changelog.loading')}</LoadingState>
          ) : query.isError || !query.data ? (
            <ErrorState title={t('changelog.loadFailed')} hint={t('changelog.loadFailedHint')} />
          ) : items.length === 0 ? (
            <EmptyState icon={<TriangleAlert />}>{t('changelog.empty')}</EmptyState>
          ) : (
            <div className="panel-timeline">
              {items.map((item, index) => (
                <TimelineEntry key={`${item.version}-${item.id}`} item={item} isLast={index === items.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}




