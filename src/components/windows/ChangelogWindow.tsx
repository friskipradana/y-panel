import { useQuery } from '@tanstack/react-query'
import { BellRing, RefreshCcw, TriangleAlert, Zap } from 'lucide-react'
import { getSystemChangelog } from '@/api/agent'
import type { ChangelogEntry } from '@/types'
import { formatDateID, formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'


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
              <span className="panel-badge panel-badge--info">v{item.version}</span>
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
      <div className="panel-window__header">
        <div className="panel-window__title">
          <BellRing className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">{t('changelog.title')}</div>
            <div className="panel-window__meta">{t('changelog.subtitle')}</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button
            id="changelog-refresh"
            type="button"
            onClick={() => void query.refetch()}
            className="panel-icon-btn"
            aria-label={t('changelog.refresh')}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
          </button>
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
            <div className="panel-loading">
              <RefreshCcw className="h-4 w-4 animate-spin" />
              {t('changelog.loading')}
            </div>
          ) : query.isError || !query.data ? (
            <div className="panel-error-state">
              <TriangleAlert className="h-5 w-5" />
              <div>
                <p className="font-semibold">{t('changelog.loadFailed')}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-90">{t('changelog.loadFailedHint')}</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="panel-empty">
              <TriangleAlert className="h-8 w-8" />
              <span>{t('changelog.empty')}</span>
            </div>
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




