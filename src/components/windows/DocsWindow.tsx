import { ArrowLeft, BookOpen, Calendar, ChevronLeft, ChevronRight, FileText, Link2, PenSquare, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { DocRecord } from '@/api/agent'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { formatDateID } from '@/lib/datetime'
import { Markdown } from '@/lib/markdown'
import { DocEditorModal } from './docs/DocEditorModal'
import { DOCS_PAGE_SIZE, useDocsWindow, type DocsWindowState } from './docs/useDocsWindow'

type Tone = 'success' | 'warning' | 'neutral'
const STATUS_TONE: Record<DocRecord['status'], Tone> = { published: 'success', draft: 'warning', archived: 'neutral' }

function DocList({ dw }: { dw: DocsWindowState }) {
  const { t, docs, official, total, offset, setOffset, query, setQuery, setSearch, selected, setSelectedId } = dw
  const page = Math.floor(offset / DOCS_PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / DOCS_PAGE_SIZE))
  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
      <form
        className="flex flex-wrap items-center gap-2 border-b border-[var(--win-border)] p-2"
        onSubmit={(e) => {
          e.preventDefault()
          setOffset(0)
          setSearch(query.trim())
        }}
      >
        <label className="panel-search flex-1">
          <Search className="h-4 w-4" />
          <input id="docs-search-input" value={query} onChange={(e) => setQuery(e.target.value)} className="panel-search__input min-w-0" placeholder={t('docs.searchPlaceholder')} />
        </label>
        <Button type="submit" variant="primary-soft" className="shrink-0">
          {t('docs.search')}
        </Button>
      </form>

      <ul className="min-h-0 flex-1 divide-y divide-[var(--win-border)] overflow-y-auto">
        {[...official, ...docs].map((doc) => (
          <li key={doc.id}>
            <button
              id={`docs-item-${doc.id}`}
              type="button"
              onClick={() => setSelectedId(doc.id)}
              aria-current={selected?.id === doc.id ? 'true' : undefined}
              className={`block w-full px-3 py-3 text-left transition-colors hover:bg-[var(--panel-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] ${
                selected?.id === doc.id ? 'bg-[var(--panel-primary-bg)]' : ''
              }`}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                {doc.source === 'official' ? (
                  <Badge tone="primary">{t('docs.officialBadge')}</Badge>
                ) : (
                  <Badge tone={STATUS_TONE[doc.status]}>{t(`docs.status.${doc.status}`)}</Badge>
                )}
                {doc.isPublic && doc.source !== 'official' ? <Badge tone="info">{t('docs.publicBadge')}</Badge> : null}
                <span className="text-[0.75rem] text-[var(--text-secondary)]">{formatDateID(doc.updatedAt)}</span>
              </span>
              <span className="mt-1 block text-[0.875rem] font-semibold leading-snug">{doc.title}</span>
              {doc.excerpt ? <span className="mt-0.5 line-clamp-2 block text-[0.8125rem] text-[var(--text-secondary)]">{doc.excerpt}</span> : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--win-border)] p-2">
        <Button id="docs-prev-page" type="button" variant="ghost" disabled={offset <= 0} onClick={() => setOffset((v) => Math.max(0, v - DOCS_PAGE_SIZE))}>
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('docs.previous')}
        </Button>
        <span className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">
          {page}/{totalPages}
        </span>
        <Button id="docs-next-page" type="button" variant="ghost" disabled={offset + DOCS_PAGE_SIZE >= total} onClick={() => setOffset((v) => v + DOCS_PAGE_SIZE)}>
          {t('docs.next')}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function DocViewer({ dw, doc }: { dw: DocsWindowState; doc: DocRecord }) {
  const { t, isAdmin, openEdit, confirmDelete, copyLink, setSelectedId } = dw
  const shared = doc.isPublic && doc.status === 'published'
  const official = doc.source === 'official'
  return (
    <article className="min-h-0 overflow-y-auto rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
      <Button variant="ghost" className="mb-3 @3xl:hidden" onClick={() => setSelectedId(null)}>
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('docs.back')}
      </Button>
      <header className="space-y-2">
        <h2 className="text-lg font-bold leading-snug">{doc.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
          {official ? <Badge tone="primary">{t('docs.officialBadge')}</Badge> : <Badge tone={STATUS_TONE[doc.status]}>{t(`docs.status.${doc.status}`)}</Badge>}
          {shared && !official ? <Badge tone="info">{t('docs.publicBadge')}</Badge> : null}
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
  const dw = useDocsWindow()
  const { t, isAdmin, docsQuery, docs, official, selected, openCreate } = dw

  return (
    <div className="panel-window @container flex h-full flex-col">
      <div className="flex min-h-[40px] shrink-0 items-center justify-between gap-2 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-1">
        <span className="text-xs font-semibold text-[var(--win-text)]">
          {dw.total} {t('docs.title')}
        </span>
        <div className="flex items-center gap-2">
          <IconButton onClick={() => void docsQuery.refetch()} label={t('docs.refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${docsQuery.isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
          {isAdmin ? (
            <Button onClick={openCreate} variant="primary-soft" className="px-2.5 py-1 text-xs">
              <Plus className="h-3.5 w-3.5" />
              {t('docs.newArticle')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        {docsQuery.isLoading ? (
          <LoadingState>{t('docs.loading')}</LoadingState>
        ) : docsQuery.isError ? (
          <ErrorState
            title={t('docs.loadFailed')}
            hint={t('docs.loadFailedHint')}
            action={
              <Button variant="ghost" loading={docsQuery.isFetching} onClick={() => void docsQuery.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : docs.length === 0 && official.length === 0 && !dw.search ? (
          <EmptyState icon={<FileText />}>{isAdmin ? t('docs.empty') : t('docs.emptyReader')}</EmptyState>
        ) : (
          <div className="grid h-full min-h-0 gap-3 @3xl:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
            <div className={`min-h-0 ${selected ? '@max-3xl:hidden' : ''}`}>
              {docs.length === 0 && official.length === 0 ? <EmptyState icon={<Search />}>{t('docs.noMatch')}</EmptyState> : <DocList dw={dw} />}
            </div>
            <div className={`min-h-0 ${selected ? '' : '@max-3xl:hidden'}`}>
              {selected ? <DocViewer dw={dw} doc={selected} /> : <EmptyState icon={<BookOpen />}>{t('docs.selectArticle')}</EmptyState>}
            </div>
          </div>
        )}
      </div>

      <DocEditorModal dw={dw} />
    </div>
  )
}
