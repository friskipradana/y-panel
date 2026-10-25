import { ArrowLeft, BookOpen, Calendar, FileText, Link2, PenSquare, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { DocRecord } from '@/api/agent'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/states'
import { formatDateID } from '@/lib/datetime'
import { Markdown } from '@/lib/markdown'
import { DocEditorModal } from './docs/DocEditorModal'
import { DOCS_PAGE_SIZE, useDocsWindow, type DocsWindowState } from './docs/useDocsWindow'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'

// what a reader sees: the pill of each, in the classes the list windows share
function visibility(doc: DocRecord): string {
  if (doc.source === 'official') return 'official'
  if (doc.status !== 'published') return doc.status
  return doc.isPublic ? 'public' : 'private'
}
const PILL: Record<string, string> = { official: 'running', public: 'running', private: 'exited', draft: 'paused', archived: 'exited' }

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
            const kind = visibility(doc)
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
                  <span className="docs-row__date">{formatDateID(doc.updatedAt)}</span>
                </div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${PILL[kind] ?? 'exited'}`}>
                    <span className="docker-status-dot" />
                    <span>{t(`docs.visibility.${kind}`)}</span>
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

function DocViewer({ dw, doc }: { dw: DocsWindowState; doc: DocRecord }) {
  const { t, isAdmin, openEdit, confirmDelete, copyLink, setSelectedId } = dw
  const shared = doc.isPublic && doc.status === 'published'
  const official = doc.source === 'official'
  const kind = visibility(doc)
  return (
    <article className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
      <Button variant="ghost" className="mb-3 @3xl:hidden" onClick={() => setSelectedId(null)}>
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('docs.back')}
      </Button>
      <header className="space-y-2">
        <h2 className="text-lg font-bold leading-snug">{doc.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
          <Badge tone={official ? 'primary' : doc.status === 'published' ? 'success' : doc.status === 'draft' ? 'warning' : 'neutral'}>{t(`docs.visibility.${kind}`)}</Badge>
          <span className="panel-mono">/{doc.slug}</span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateID(doc.updatedAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shared || official ? (
            <Button variant="ghost" onClick={() => void copyLink(doc)}>
              <Link2 className="h-3.5 w-3.5" />
              {t('docs.copyPublicLink')}
            </Button>
          ) : null}
          {isAdmin && !official ? (
            <>
              <Button variant="ghost" onClick={() => openEdit(doc)}>
                <PenSquare className="h-3.5 w-3.5" />
                {t('common.edit')}
              </Button>
              <Button variant="danger-soft" onClick={() => void confirmDelete(doc)}>
                <Trash2 className="h-3.5 w-3.5" />
                {t('common.delete')}
              </Button>
            </>
          ) : null}
        </div>
      </header>
      <Markdown source={doc.content} className="mt-5" />
    </article>
  )
}

export default function DocsWindow() {
  const isMobile = useIsMobileLayout()
  const dw = useDocsWindow()
  const { t, isAdmin, docsQuery, all, list, selected, openCreate, setPage } = dw

  return (
    <div className="panel-window docker-window-root @container relative overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            {isAdmin ? (
              <button type="button" className="docker-primary-btn" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('docs.newArticle')}</span>
              </button>
            ) : null}

            <div className="docker-badge-running docker-badge-running--mobile">
              <span>{t('docs.count', { count: all })}</span>
            </div>
          </div>

          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                id="docs-search-input"
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('docs.searchShort')}
                placeholder={t('docs.searchShort')}
                value={list.text}
                onChange={(e) => {
                  setPage(1)
                  list.setText(e.target.value)
                }}
              />
            </div>

            <button
              type="button"
              className="docker-icon-btn docker-icon-btn--mobile"
              title={t('docs.refresh')}
              aria-label={t('docs.refresh')}
              onClick={() => void docsQuery.refetch()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${docsQuery.isFetching && !docsQuery.isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            {isAdmin ? (
              <button type="button" className="docker-primary-btn" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('docs.newArticle')}</span>
              </button>
            ) : null}
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                id="docs-search-input"
                type="search"
                className="docker-search-input"
                aria-label={t('docs.searchShort')}
                placeholder={t('docs.searchShort')}
                value={list.text}
                onChange={(e) => {
                  setPage(1)
                  list.setText(e.target.value)
                }}
              />
            </div>
            <button type="button" className="docker-icon-btn" title={t('docs.refresh')} aria-label={t('docs.refresh')} onClick={() => void docsQuery.refetch()}>
              <RefreshCw className={`h-3.5 w-3.5 ${(docsQuery.isFetching && !docsQuery.isLoading) ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <div className="docker-badge-running">{t('docs.count', { count: all })}</div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 p-3 @3xl:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <div className={`flex min-h-0 flex-col ${selected ? '@max-3xl:hidden' : ''}`}>
          <DocList dw={dw} />
        </div>
        <div className={`flex min-h-0 flex-col ${selected ? '' : '@max-3xl:hidden'}`}>
          {selected ? <DocViewer dw={dw} doc={selected} /> : <EmptyState icon={<BookOpen />}>{t('docs.selectArticle')}</EmptyState>}
        </div>
      </div>

      <DocEditorModal dw={dw} />
    </div>
  )
}
