import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  convertDevDocToInvoice,
  createDevDoc,
  createDevTodo,
  deleteDevDoc,
  deleteDevTodo,
  generateDevDocWithAI,
  getDevDeskOverview,
  rotateDevDocToken,
  updateDevDoc,
  updateDevTodo,
  type AIGeneratedDevDoc,
  type DevDocInput,
  type DevDocKind,
  type DevDocument,
  type DevTodoPriority,
  type DevTodoStatus,
} from '@/api/devdesk'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'

export type DevDeskSection = 'quotations' | 'invoices' | 'todos'

export interface DevDocDraftSeed {
  kind: DevDocKind
  clientName?: string
  clientCompany?: string
  sourceNotes?: string
  generated?: AIGeneratedDevDoc
}

export function useDevDeskWindow(win: WindowState, authenticated: boolean) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [section, setSection] = useState<DevDeskSection>('invoices')
  const [search, setSearch] = useState('')
  const [todoDocFilter, setTodoDocFilter] = useState<string>('all')
  const [editingDoc, setEditingDoc] = useState<DevDocument | null>(null)
  const [draftSeed, setDraftSeed] = useState<DevDocDraftSeed | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  const overviewQ = useQuery({
    queryKey: ['devdesk-overview'],
    queryFn: () => getDevDeskOverview(),
    enabled: authenticated,
    refetchInterval: pollingActive ? 30_000 : false,
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['devdesk-overview'] })
  }

  const saveDocMut = useMutation({
    mutationFn: async ({ id, payload }: { id?: number; payload: DevDocInput }) => {
      if (id) return updateDevDoc(id, payload)
      const res = await createDevDoc(payload)
      return res.doc
    },
    onSuccess: (doc) => {
      toast.success(t('devdesk.docSaved', { num: doc.docNumber }))
      setEditingDoc(null)
      setDraftSeed(null)
      setSection(doc.kind === 'invoice' ? 'invoices' : 'quotations')
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteDocMut = useMutation({
    mutationFn: deleteDevDoc,
    onSuccess: () => {
      toast.success(t('devdesk.docDeleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rotateTokenMut = useMutation({
    mutationFn: rotateDevDocToken,
    onSuccess: () => {
      toast.success(t('devdesk.tokenRotated'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const convertMut = useMutation({
    mutationFn: convertDevDocToInvoice,
    onSuccess: (inv) => {
      toast.success(t('devdesk.convertedOk', { num: inv.docNumber }))
      setSection('invoices')
      setEditingDoc(inv)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const aiGenMut = useMutation({
    mutationFn: (payload: { kind: DevDocKind; clientName: string; clientCompany: string; budgetHint: string; notes: string }) =>
      generateDevDocWithAI({ ...payload, language }),
    onSuccess: (generated, vars) => {
      setAiModalOpen(false)
      setEditingDoc(null)
      setDraftSeed({
        kind: vars.kind,
        clientName: vars.clientName,
        clientCompany: vars.clientCompany,
        sourceNotes: vars.notes,
        generated,
      })
      toast.success(t('devdesk.aiGeneratedOk'))
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createTodoMut = useMutation({
    mutationFn: (payload: { docId: number; title: string; notes?: string; priority?: DevTodoPriority; dueDate?: string }) =>
      createDevTodo(payload),
    onSuccess: () => {
      toast.success(t('devdesk.todoAdded'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateTodoMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<{ status: DevTodoStatus; priority: DevTodoPriority; title: string; notes: string }> }) =>
      updateDevTodo(id, patch),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteTodoMut = useMutation({
    mutationFn: deleteDevTodo,
    onSuccess: () => {
      toast.success(t('devdesk.todoDeleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const confirmDeleteDoc = async (doc: DevDocument) => {
    const ok = await alertLib.confirm(
      t('devdesk.deleteDocTitle'),
      t('devdesk.deleteDocConfirm', { name: `${doc.docNumber} (${doc.title || doc.clientName})` }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteDocMut.mutate(doc.id)
  }

  const publicUrlOf = (doc: DevDocument) => `${window.location.origin}/doc/${doc.publicToken}`

  const copyPublicUrl = (doc: DevDocument) => {
    void navigator.clipboard.writeText(publicUrlOf(doc)).then(() => toast.success(t('devdesk.publicUrlCopied')))
  }

  const openAiSettings = () => {
    useSettingsNavStore.getState().request('ai_integration')
    useWindowStore.getState().openWindow('settings')
  }

  const docs = useMemo(() => overviewQ.data?.docs ?? [], [overviewQ.data?.docs])
  const todos = useMemo(() => overviewQ.data?.todos ?? [], [overviewQ.data?.todos])

  const quotations = useMemo(() => docs.filter((d) => d.kind === 'quotation'), [docs])
  const invoices = useMemo(() => docs.filter((d) => d.kind === 'invoice'), [docs])

  const todoCountByDoc = useMemo(() => {
    const map = new Map<number, { total: number; done: number }>()
    for (const item of todos) {
      const cur = map.get(item.docId) ?? { total: 0, done: 0 }
      cur.total++
      if (item.status === 'done') cur.done++
      map.set(item.docId, cur)
    }
    return map
  }, [todos])

  return {
    t,
    section,
    setSection,
    search,
    setSearch,
    todoDocFilter,
    setTodoDocFilter,
    overviewQ,
    refresh,
    docs,
    quotations,
    invoices,
    todos,
    todoCountByDoc,
    aiReady: Boolean(overviewQ.data?.aiReady),
    aiProvider: overviewQ.data?.aiProvider ?? '',
    aiModel: overviewQ.data?.aiModel ?? '',
    editingDoc,
    setEditingDoc,
    draftSeed,
    setDraftSeed,
    aiModalOpen,
    setAiModalOpen,
    saveDocMut,
    deleteDocMut,
    rotateTokenMut,
    convertMut,
    aiGenMut,
    createTodoMut,
    updateTodoMut,
    deleteTodoMut,
    confirmDeleteDoc,
    publicUrlOf,
    copyPublicUrl,
    openAiSettings,
  }
}

export type DevDeskWindowState = ReturnType<typeof useDevDeskWindow>
