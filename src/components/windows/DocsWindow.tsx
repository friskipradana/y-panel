import { useState } from 'react'
import { BookOpen, Bot, CalendarClock, FileText, Plus, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/states'
import { StudioScheduleModal } from '@/components/windows/studio/StudioScheduleModal'
import { StudioSchedulesPanel } from '@/components/windows/studio/StudioSchedulesPanel'
import { formatDateID } from '@/lib/datetime'
import { DocAiModal } from './docs/DocAiModal'
import { DocFeaturesView } from './docs/DocFeaturesView'
import { docKind, PILL, visibility } from './docs/docMeta'
import { DocViewer } from './docs/DocViewer'
import { DocEditorModal } from './docs/DocEditorModal'
import { useDocsSchedules } from './docs/useDocsSchedules'
import { DOCS_PAGE_SIZE, useDocsWindow, type DocKindFilter, type DocsView, type DocsWindowState } from './docs/useDocsWindow'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'

function DocList({ dw }: { dw: DocsWindowState }) {
  const { t, docs, total, all, facets, narrowed, list, page, setPage, selected, setSelectedId, docsQuery } = dw
  const totalPages = Math.max(1, Math.ceil(total / DOCS_PAGE_SIZE))
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--win-border)]">
      <ListTable
        variant="docs"
        empty={docsQuery.isLoading || docsQuery.isError || docs.length === 0}
        columns={[
          list.column('title', t('docs.col.title'), undefined, { filterable: false }),
          list.column('status', t('docs.col.status'), facets?.status, { labelOf: (v) => t(`docs.visibility.${v}`) }),
        ]}
      >
        <ListState
          loading={docsQuery.isLoading}
          error={docsQuery.isError}
          errorTitle={t('docs.loadFailed')}
          errorHint={t('docs.loadFailedHint')}
          loadingText={t('docs.loading')}
          empty={docs.length === 0}
          emptyIcon={<FileText />}
          emptyTitle={narrowed ? t('docs.noMatch') : t('docs.emptyReader')}
        >
          {docs.map((doc) => {
            const vis = visibility(doc)
            const kind = docKind(doc)
            return (
              <button
                key={doc.id}
                id={`docs-item-${doc.id}`}
                type="button"
                onClick={() => setSelectedId(doc.id)}
                aria-current={selected?.id === doc.id ? 'true' : undefined}
                className={`docker-row docs-row${selected?.id === doc.id ? ' docker-row--selected' : ''}`}
              >
                <div className="docker-row__text">
                  <span className="docker-app-name" title={doc.title}>{doc.title}</span>
                  {doc.excerpt ? <span className="docs-row__excerpt">{doc.excerpt}</span> : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={kind === 'doc' ? 'info' : 'neutral'} size="sm">{t(`docs.kind.${kind}`)}</Badge>
                    <span className="docs-row__date">{formatDateID(doc.updatedAt)}</span>
                  </div>
                </div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${PILL[vis] ?? 'exited'}`}>
                    <span className="docker-status-dot" />
                    <span>{t(`docs.visibility.${vis}`)}</span>
                  </span>
                </div>
              </button>
            )
          })}
        </ListState>
      </ListTable>

      <div className="docker-statusbar">
        <span>{narrowed ? t('docs.countOf', { shown: total, total: all }) : t('docs.count', { count: all })}</span>
        {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onChange={setPage} /> : null}
      </div>
    </div>
  )
}

export default function DocsWindow() {
  const isMobile = useIsMobileLayout()
  const dw = useDocsWindow()
  const [showSchedules, setShowSchedules] = useState(false)
  const { t, isAdmin, docsQuery, featuresQuery, all, facets, list, kindFilter, setKindFilter, selected, openCreate, openAiFor, setPage, view, setView, features } = dw
  const onFeatures = view === 'features'
  const schedulesState = useDocsSchedules(isAdmin && showSchedules)

  if (isAdmin && showSchedules) {
    return (
      <div className="panel-window docker-window-root @container relative flex flex-col overflow-hidden">
        <StudioSchedulesPanel st={schedulesState} onBack={() => setShowSchedules(false)} />
        <StudioScheduleModal st={schedulesState} />
      </div>
    )
  }

  const kindItems = [
    { key: 'all', label: t('docs.kind.all'), count: all },
    { key: 'doc', label: t('docs.kind.doc'), count: facets?.kind?.doc ?? 0 },
    { key: 'article', label: t('docs.kind.article'), count: facets?.kind?.article ?? 0 },
  ]

  return (
    <div className="panel-window docker-window-root @container relative overflow-hidden">
      <div className={`docker-topbar ${isMobile ? 'docker-topbar--mobile' : ''}`}>
        <div className={isMobile ? 'docker-topbar__mobile-row' : 'docker-topbar__left'}>
          <FilterMenu
            label={t('docs.view')}
            value={view}
            onChange={(v) => setView(v as DocsView)}
            items={[
              { key: 'posts', label: t('docs.viewPosts'), count: all },
              { key: 'features', label: t('docs.viewFeatures'), count: features.length },
            ]}
          />
          {onFeatures ? null : (
            <FilterMenu
              label={t('docs.fieldKind')}
              value={kindFilter}
              onChange={(v) => setKindFilter(v as DocKindFilter)}
              items={kindItems}
            />
          )}
          {isAdmin ? (
            <>
              <button type="button" className="docker-primary-btn" onClick={() => openCreate()}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('docs.newArticle')}</span>
              </button>
              <button type="button" className="docker-secondary-btn" onClick={() => openAiFor()}>
                <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="docker-secondary-btn__text">{t('docs.aiGenerateBtn')}</span>
              </button>
              <button type="button" className="docker-secondary-btn" onClick={() => setShowSchedules(true)}>
                <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="docker-secondary-btn__text">{t('docs.autoSchedulesBtn')}</span>
              </button>
            </>
          ) : null}
        </div>

        <div className={isMobile ? 'docker-topbar__mobile-search' : 'docker-topbar__right'}>
          <div className={`docker-search-wrap ${isMobile ? 'docker-search-wrap--mobile' : ''}`}>
            <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
            <input
              id="docs-search-input"
              type="search"
              className={`docker-search-input ${isMobile ? 'docker-search-input--mobile' : ''}`}
              aria-label={t(onFeatures ? 'docs.features.search' : 'docs.searchShort')}
              placeholder={t(onFeatures ? 'docs.features.search' : 'docs.searchShort')}
              value={list.text}
              onChange={(e) => {
                setPage(1)
                list.setText(e.target.value)
              }}
            />
          </div>
          <button
            type="button"
            className={`docker-icon-btn ${isMobile ? 'docker-icon-btn--mobile' : ''}`}
            title={t('docs.refresh')}
            aria-label={t('docs.refresh')}
            onClick={() => {
              void docsQuery.refetch()
              void featuresQuery.refetch()
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${docsQuery.isFetching && !docsQuery.isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
          {!isMobile && !onFeatures ? <div className="docker-badge-running">{t('docs.count', { count: all })}</div> : null}
        </div>
      </div>

      {onFeatures ? <DocFeaturesView dw={dw} /> : null}
      <div className={`min-h-0 flex-1 gap-3 p-3 @3xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] ${onFeatures ? 'hidden' : 'grid'}`}>
        <div className={`flex min-h-0 flex-col ${selected ? '@max-3xl:hidden' : ''}`}>
          <DocList dw={dw} />
        </div>
        <div className={`flex min-h-0 flex-col ${selected ? '' : '@max-3xl:hidden'}`}>
          {selected ? <DocViewer dw={dw} doc={selected} /> : <EmptyState icon={<BookOpen />}>{t('docs.selectArticle')}</EmptyState>}
        </div>
      </div>

      <DocEditorModal dw={dw} />
      <DocAiModal dw={dw} />
    </div>
  )
}
