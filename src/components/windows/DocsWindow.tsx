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
  const normalized = content.replace(/[#>*`_\-]/g, ' ').replace(/\s+/g, ' ').trim()
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
      toast.success('Dokumentasi dibuat', { description: `Artikel ${doc.title} berhasil ditambahkan.` })
      qc.invalidateQueries({ queryKey: ['docs'] })
      setShowEditor(false)
      setEditingDoc(null)
      setForm(initialForm())
      setSelectedDoc(doc)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? 'Gagal membuat dokumentasi'
      toast.error('Gagal membuat dokumentasi', { description: message })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: DocPayload }) => updateDoc(id, payload),
    onSuccess: (doc) => {
      toast.success('Dokumentasi diperbarui', { description: `Artikel ${doc.title} berhasil diperbarui.` })
      qc.invalidateQueries({ queryKey: ['docs'] })
      setShowEditor(false)
      setEditingDoc(null)
      setForm(initialForm())
      setSelectedDoc(doc)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? 'Gagal memperbarui dokumentasi'
      toast.error('Gagal memperbarui dokumentasi', { description: message })
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteDoc,
    onSuccess: () => {
      toast.success('Dokumentasi dihapus')
      qc.invalidateQueries({ queryKey: ['docs'] })
      setSelectedDoc(null)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? 'Gagal menghapus dokumentasi'
      toast.error('Gagal menghapus dokumentasi', { description: message })
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
            <div className="panel-window__title-text">Docs & Tutorials</div>
            <div className="panel-window__meta">Knowledge base tersimpan di database dan bisa dikelola seperti blog internal.</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button onClick={() => docsQuery.refetch()} className="panel-icon-btn" aria-label="Refresh docs">
            <RefreshCw className={`h-3.5 w-3.5 ${docsQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
          {isAdmin && (
            <button onClick={openCreate} className="panel-btn panel-btn--primary-soft">
              <Plus className="h-3.5 w-3.5" />
              Artikel Baru
            </button>
          )}
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
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
                placeholder="Cari judul, slug, excerpt, atau isi dokumentasi..."
              />
              <button type="submit" className="panel-btn panel-btn--primary-soft">
                Cari
              </button>
            </form>
            <div className="panel-pagination-summary">{total} artikel • halaman {page}/{totalPages}</div>
          </div>

          {docsQuery.isLoading ? (
            <div className="panel-loading">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Memuat dokumentasi dari database...
            </div>
          ) : docs.length === 0 ? (
            <div className="panel-empty">
              <FileText className="h-8 w-8" />
              <span>Tidak ada artikel yang cocok dengan pencarian saat ini.</span>
            </div>
          ) : (
            <div className="docs-layout">
              <div className="docs-list">
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
                          {doc.status}
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
                    Sebelumnya
                  </button>
                  <button
                    id="docs-next-page"
                    type="button"
                    className="panel-btn panel-btn--ghost"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset((value) => value + PAGE_SIZE)}
                  >
                    Berikutnya
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
                          <span className="docs-viewer__meta-item"><Eye className="h-3.5 w-3.5" /> status {selectedDoc.status}</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="docs-viewer__actions">
                          <button onClick={() => openEdit(selectedDoc)} className="panel-btn panel-btn--ghost">
                            <PenSquare className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              const confirmed = await alertLib.confirm(
                                'Hapus Artikel?',
                                `Artikel <strong>${selectedDoc.title}</strong> akan dihapus permanen dari database.`,
                                'Hapus Artikel',
                                'Batal',
                                'warning',
                                'docs',
                              )
                              if (confirmed) deleteMut.mutate(selectedDoc.id)
                            }}
                            className="panel-btn panel-btn--danger-soft"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus
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
                    <span>Pilih artikel di sebelah kiri untuk membaca detailnya.</span>
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
                <div className="docs-editor-modal__title">{editingDoc ? 'Edit Artikel' : 'Artikel Baru'}</div>
                <div className="panel-window__meta">Simpan tutorial, SOP, atau catatan troubleshooting langsung ke database.</div>
              </div>
              <button onClick={() => setShowEditor(false)} className="panel-icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="docs-editor-modal__body">
              <div className="panel-grid-compact panel-grid-compact--2">
                <div>
                  <label className="panel-section-label">Judul</label>
                  <input value={form.title ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="panel-input" />
                </div>
                <div>
                  <label className="panel-section-label">Slug</label>
                  <input value={form.slug ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))} className="panel-input panel-input--mono" />
                </div>
              </div>
              <div>
                <label className="panel-section-label">Excerpt</label>
                <textarea value={form.excerpt ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))} className="panel-textarea" rows={3} />
              </div>
              <div>
                <label className="panel-section-label">Isi Artikel</label>
                <textarea value={form.content} onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))} className="panel-textarea docs-editor-modal__content" rows={14} />
              </div>
              <div>
                <label className="panel-section-label">Status</label>
                <select value={form.status ?? 'draft'} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as DocPayload['status'] }))} className="panel-select">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="docs-editor-modal__footer">
              <button onClick={() => setShowEditor(false)} className="panel-btn panel-btn--ghost">Batal</button>
              <button onClick={submit} disabled={createMut.isPending || updateMut.isPending || !form.title || !form.content} className="panel-btn panel-btn--primary">
                <Save className="h-3.5 w-3.5" />
                {createMut.isPending || updateMut.isPending ? 'Menyimpan...' : 'Simpan Artikel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
