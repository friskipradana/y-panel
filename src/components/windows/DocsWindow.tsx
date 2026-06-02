import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Eye,
  Trash2,
  X,
  Save,
  PenSquare,
} from 'lucide-react'
import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import { createDoc, deleteDoc, listDocs, updateDoc, type DocPayload, type DocRecord } from '@/api/agent'
import { useI18n } from '@/lib/i18n'

const PAGE_SIZE = 6

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function excerptFromContent(content: string) {
  const normalized = content.replace(/[#>*`_-]/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized
}

function initialForm(): DocPayload {
  return {
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    status: 'draft',
  }
}

export default function DocsWindow() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const me = useMemo(() => {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('me-v2-cache') : null
    return raw ? (JSON.parse(raw) as { role?: string }) : null
  }, [])
  const isAdmin = me?.role === 'admin' || me?.role === 'superadmin'

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedDoc, setSelectedDoc] = useState<DocRecord | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DocRecord | null>(null)
  const [form, setForm] = useState<DocPayload>(initialForm())

  const docsQuery = useQuery({
    queryKey: ['docs', { search, offset, isAdmin }],
    queryFn: () => listDocs({ q: search, limit: PAGE_SIZE, offset, includeDrafts: isAdmin }),
    refetchInterval: 20_000,
  })

  const docs = docsQuery.data?.items ?? []
  const total = docsQuery.data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const createMut = useMutation({
    mutationFn: createDoc,
    onSuccess: (doc) => {
      toast.success(t('docs.created'), { description: t('docs.createdDesc', { title: doc.title }) })
      qc.invalidateQueries({ queryKey: ['docs'] })
      setShowEditor(false)
      setEditingDoc(null)
      setForm(initialForm())
      setSelectedDoc(doc)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? t('docs.createFailed')
      toast.error(t('docs.createFailed'), { description: message })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: DocPayload }) => updateDoc(id, payload),
    onSuccess: (doc) => {
      toast.success(t('docs.updated'), { description: t('docs.updatedDesc', { title: doc.title }) })
      qc.invalidateQueries({ queryKey: ['docs'] })
      setShowEditor(false)
      setEditingDoc(null)
      setForm(initialForm())
      setSelectedDoc(doc)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? t('docs.updateFailed')
      toast.error(t('docs.updateFailed'), { description: message })
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteDoc,
    onSuccess: () => {
      toast.success(t('docs.deleted'))
      qc.invalidateQueries({ queryKey: ['docs'] })
      setSelectedDoc(null)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? t('docs.deleteFailed')
      toast.error(t('docs.deleteFailed'), { description: message })
    },
  })

  const openCreate = () => {
    setEditingDoc(null)
    setForm(initialForm())
    setShowEditor(true)
  }

  const openEdit = (doc: DocRecord) => {
    setEditingDoc(doc)
    setForm({
      title: doc.title,
      slug: doc.slug,
      excerpt: doc.excerpt,
      content: doc.content,
      status: doc.status,
    })
    setShowEditor(true)
  }

  const submit = () => {
    if (editingDoc) {
      updateMut.mutate({ id: editingDoc.id, payload: form })
      return
    }
    createMut.mutate(form)
  }

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <BookOpen className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">{t('docs.title')}</div>
            <div className="panel-window__meta">{t('docs.subtitle')}</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button onClick={() => docsQuery.refetch()} className="panel-icon-btn" aria-label={t('docs.refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${docsQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
          {isAdmin && (
            <button onClick={openCreate} className="panel-btn panel-btn--primary-soft">
              <Plus className="h-3.5 w-3.5" />
              {t('docs.newArticle')}
            </button>
          )}
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          {docsQuery.isLoading ? (
            <div className="panel-loading">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t('docs.loading')}
            </div>
          ) : docs.length === 0 ? (
            <div className="panel-empty">
              <FileText className="h-8 w-8" />
              <span>{t('docs.empty')}</span>
            </div>
          ) : (
            <div className="docs-layout">
              <div className="panel-table-container">
                <div className="panel-toolbar panel-toolbar--search">
                  <form
                    className="panel-search"
                    onSubmit={(e) => {
                      e.preventDefault()
                      setOffset(0)
                      setSearch(query.trim())
                    }}
                  >
                    <Search className="h-4 w-4" />
                    <input
                      id="docs-search-input"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="panel-search__input"
                      placeholder={t('docs.searchPlaceholder')}
                    />
                    <button type="submit" className="panel-btn panel-btn--primary-soft">
                      {t('docs.search')}
                    </button>
                  </form>
                  <div className="panel-pagination-summary">{t('docs.paginationSummary', { total, page, totalPages })}</div>
                </div>
                {docs.map((doc) => {
                  const active = selectedDoc?.id === doc.id
                  return (
                    <button
                      key={doc.id}
                      id={`docs-item-${doc.id}`}
                      type="button"
                      onClick={() => setSelectedDoc(doc)}
                      className={`docs-list__item ${active ? 'docs-list__item--active' : ''}`}
                    >
                      <div className="docs-list__meta-row">
                        <span className={`panel-badge ${doc.status === 'published' ? 'panel-badge--success' : doc.status === 'draft' ? 'panel-badge--warning' : 'panel-badge--neutral'}`}>
                          {t(`docs.status.${doc.status}`)}
                        </span>
                        <span className="docs-list__date">{formatDate(doc.updatedAt)}</span>
                      </div>
                      <div className="docs-list__title">{doc.title}</div>
                      <div className="docs-list__excerpt">{doc.excerpt || excerptFromContent(doc.content)}</div>
                    </button>
                  )
                })}

                <div className="panel-pagination">
                  <button
                    id="docs-prev-page"
                    type="button"
                    className="panel-btn panel-btn--ghost"
                    disabled={offset <= 0}
                    onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {t('docs.previous')}
                  </button>
                  <button
                    id="docs-next-page"
                    type="button"
                    className="panel-btn panel-btn--ghost"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset((value) => value + PAGE_SIZE)}
                  >
                    {t('docs.next')}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <article className="docs-viewer">
                {selectedDoc ? (
                  <>
                    <div className="docs-viewer__header">
                      <div>
                        <div className="docs-viewer__title">{selectedDoc.title}</div>
                        <div className="docs-viewer__meta">
                          <span className="panel-badge panel-badge--info">/{selectedDoc.slug}</span>
                          <span className="docs-viewer__meta-item"><Calendar className="h-3.5 w-3.5" /> {formatDate(selectedDoc.updatedAt)}</span>
                          <span className="docs-viewer__meta-item"><Eye className="h-3.5 w-3.5" /> {t('docs.status', { status: t(`docs.status.${selectedDoc.status}`) })}</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="docs-viewer__actions">
                          <button onClick={() => openEdit(selectedDoc)} className="panel-btn panel-btn--ghost">
                            <PenSquare className="h-3.5 w-3.5" />
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={async () => {
                              const confirmed = await alertLib.confirm(
                                t('docs.deleteArticle'),
                                t('docs.deleteArticleMessage', { title: selectedDoc.title }),
                                t('docs.deleteArticle'),
                                t('common.cancel'),
                                'warning',
                                'docs',
                              )
                              if (confirmed) deleteMut.mutate(selectedDoc.id)
                            }}
                            className="panel-btn panel-btn--danger-soft"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('common.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="docs-viewer__excerpt">{selectedDoc.excerpt || excerptFromContent(selectedDoc.content)}</div>
                    <div className="docs-viewer__content">{selectedDoc.content}</div>
                  </>
                ) : (
                  <div className="panel-empty docs-viewer__empty">
                    <BookOpen className="h-8 w-8" />
                    <span>{t('docs.selectArticle')}</span>
                  </div>
                )}
              </article>
            </div>
          )}
        </div>
      </div>

      {showEditor && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card docs-editor-modal">
            <div className="docs-editor-modal__header">
              <div>
                <div className="docs-editor-modal__title">{editingDoc ? t('docs.editArticle') : t('docs.newArticle')}</div>
                <div className="panel-window__meta">{t('docs.editorSubtitle')}</div>
              </div>
              <button onClick={() => setShowEditor(false)} className="panel-icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="docs-editor-modal__body">
              <div className="panel-grid-compact panel-grid-compact--2">
                <div>
                  <label className="panel-section-label">{t('docs.fieldTitle')}</label>
                  <input value={form.title ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="panel-input" />
                </div>
                <div>
                  <label className="panel-section-label">{t('docs.fieldSlug')}</label>
                  <input value={form.slug ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))} className="panel-input panel-input--mono" />
                </div>
              </div>
              <div>
                <label className="panel-section-label">{t('docs.fieldExcerpt')}</label>
                <textarea value={form.excerpt ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))} className="panel-textarea" rows={3} />
              </div>
              <div>
                <label className="panel-section-label">{t('docs.fieldContent')}</label>
                <textarea value={form.content} onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))} className="panel-textarea docs-editor-modal__content" rows={14} />
              </div>
              <div>
                <label className="panel-section-label">{t('docs.fieldStatus')}</label>
                <select value={form.status ?? 'draft'} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as DocPayload['status'] }))} className="panel-select">
                  <option value="draft">{t('docs.status.draft')}</option>
                  <option value="published">{t('docs.status.published')}</option>
                  <option value="archived">{t('docs.status.archived')}</option>
                </select>
              </div>
            </div>
            <div className="docs-editor-modal__footer">
              <button onClick={() => setShowEditor(false)} className="panel-btn panel-btn--ghost">{t('common.cancel')}</button>
              <button onClick={submit} disabled={createMut.isPending || updateMut.isPending || !form.title || !form.content} className="panel-btn panel-btn--primary">
                <Save className="h-3.5 w-3.5" />
                {createMut.isPending || updateMut.isPending ? t('docs.saving') : t('docs.saveArticle')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




