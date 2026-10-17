import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { copyTextToClipboard, createDoc, deleteDoc, listDocsTable, updateDoc, type DocPayload, type DocRecord } from '@/api/agent'
import { useListQuery } from '@/hooks/useListQuery'
import { listQueryKey } from '@/lib/listQuery'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

export const DOCS_PAGE_SIZE = 30

export function emptyDocForm(): DocPayload {
  return { title: '', slug: '', excerpt: '', content: '', status: 'draft', isPublic: false }
}

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

export function publicLink(slug: string): string {
  return `${window.location.origin}/articles/${slug}`
}

// State, queries and handlers of the docs window; the components only render.
export function useDocsWindow() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'admin' || role === 'superadmin'

  // the search, the order and the column filters; the agent applies them to local and official articles alike
  const list = useListQuery()
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<DocRecord | null>(null)

  const docsQuery = useQuery({
    queryKey: ['docs', listQueryKey(list.query), page, isAdmin],
    queryFn: () => listDocsTable(list.query, { limit: DOCS_PAGE_SIZE, offset: (page - 1) * DOCS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
  const docs = docsQuery.data?.items ?? []
  const total = docsQuery.data?.total ?? 0
  const all = docsQuery.data?.all ?? 0
  const facets = docsQuery.data?.facets
  const narrowed = !!list.query.q || Object.keys(list.filters).length > 0
  const selected = docs.find((doc) => doc.id === selectedId) ?? null

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['docs'] })
    void qc.invalidateQueries({ queryKey: ['public-docs'] })
  }

  const saveMut = useMutation({
    mutationFn: ({ id, payload }: { id: number | null; payload: DocPayload }) => (id ? updateDoc(id, payload) : createDoc(payload)),
    onSuccess: (doc, vars) => {
      toast.success(vars.id ? t('docs.updated') : t('docs.created'), { description: doc.title })
      done()
      setEditorOpen(false)
      setEditing(null)
      setSelectedId(doc.id)
    },
    onError: (e: unknown) => {
      const status = (e as { response?: { status?: number } })?.response?.status
      toast.error(t('docs.saveFailed'), { description: status === 409 ? t('docs.slugTaken') : apiError(e, t('docs.saveFailed')) })
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteDoc,
    onSuccess: () => {
      toast.success(t('docs.deleted'))
      done()
      setSelectedId(null)
    },
    onError: (e: unknown) => toast.error(t('docs.deleteFailed'), { description: apiError(e, t('docs.deleteFailed')) }),
  })

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (doc: DocRecord) => {
    setEditing(doc)
    setEditorOpen(true)
  }
  const confirmDelete = async (doc: DocRecord) => {
    const ok = await alertLib.confirm(
      t('docs.deleteArticle'),
      t('docs.deleteArticleMessage', { title: doc.title }),
      t('docs.deleteArticle'),
      t('common.cancel'),
      'warning',
      'docs',
    )
    if (ok) deleteMut.mutate(doc.id)
  }
  const copyLink = async (doc: DocRecord) => {
    try {
      if (await copyTextToClipboard(publicLink(doc.slug))) toast.success(t('docs.linkCopied'))
    } catch {
      toast.error(t('docs.copyPublicLink'), { description: publicLink(doc.slug) })
    }
  }

  return {
    t,
    isAdmin,
    docsQuery,
    docs,
    total,
    all,
    facets,
    narrowed,
    list,
    page,
    setPage,
    selected,
    setSelectedId,
    editorOpen,
    setEditorOpen,
    editing,
    saveMut,
    openCreate,
    openEdit,
    confirmDelete,
    copyLink,
  }
}

export type DocsWindowState = ReturnType<typeof useDocsWindow>
