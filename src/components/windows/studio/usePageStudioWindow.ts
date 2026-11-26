import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  createStudioPage,
  deleteStudioPage,
  generateStudioPageWithAI,
  listStudioPages,
  toggleStudioPagePublish,
  updateStudioPage,
  type AIGeneratedStudioPage,
  type StudioPage,
  type StudioPageInput,
  type StudioPageKind,
  type StudioThemeTone,
} from '@/api/studio'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'

export type StudioFilterSection = 'all' | 'landing' | 'docs'

export interface StudioDraftSeed {
  kind: StudioPageKind
  sourcePrompt?: string
  generated?: AIGeneratedStudioPage
}

export function usePageStudioWindow(win: WindowState, authenticated: boolean) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [section, setSection] = useState<StudioFilterSection>('all')
  const [search, setSearch] = useState('')
  const [editingPage, setEditingPage] = useState<StudioPage | null>(null)
  const [draftSeed, setDraftSeed] = useState<StudioDraftSeed | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  const overviewQ = useQuery({
    queryKey: ['studio-pages'],
    queryFn: () => listStudioPages(),
    enabled: authenticated,
    refetchInterval: pollingActive ? 30_000 : false,
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['studio-pages'] })
    void qc.invalidateQueries({ queryKey: ['docs'] })
  }

  const savePageMut = useMutation({
    mutationFn: async ({ id, payload }: { id?: number; payload: StudioPageInput }) =>
      id ? updateStudioPage(id, payload) : createStudioPage(payload),
    onSuccess: (page) => {
      toast.success(
        page.status === 'published'
          ? t('studio.savedPublished', { slug: page.slug })
          : t('studio.savedDraft', { title: page.title }),
      )
      setEditingPage(null)
      setDraftSeed(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const publishMut = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) => toggleStudioPagePublish(id, published),
    onSuccess: (page) => {
      toast.success(
        page.status === 'published'
          ? t('studio.publishedToast', { slug: page.slug })
          : t('studio.unpublishedToast', { title: page.title }),
      )
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deletePageMut = useMutation({
    mutationFn: deleteStudioPage,
    onSuccess: () => {
      toast.success(t('studio.deletedToast'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const aiGenMut = useMutation({
    mutationFn: (payload: {
      kind: StudioPageKind
      brandName: string
      audience: string
      ctaUrl: string
      themeTone: StudioThemeTone
      prompt: string
    }) => generateStudioPageWithAI({ ...payload, language }),
    onSuccess: (generated, vars) => {
      setAiModalOpen(false)
      setEditingPage(null)
      setDraftSeed({ kind: vars.kind, sourcePrompt: vars.prompt, generated })
      toast.success(t('studio.aiGeneratedOk'))
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const confirmDeletePage = async (page: StudioPage) => {
    const ok = await alertLib.confirm(
      t('studio.deleteTitle'),
      t('studio.deleteConfirm', { name: `${page.title} (/p/${page.slug})` }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deletePageMut.mutate(page.id)
  }

  const publicUrlOf = (page: StudioPage) =>
    `${window.location.origin}/p/${page.slug}${page.status !== 'published' ? '?preview=1' : ''}`

  const copyPublicUrl = (page: StudioPage) => {
    const url = `${window.location.origin}/p/${page.slug}`
    void navigator.clipboard.writeText(url).then(() => toast.success(t('studio.urlCopied')))
  }

  const openAiSettings = () => {
    useSettingsNavStore.getState().request('ai_integration')
    useWindowStore.getState().openWindow('settings')
  }

  const openDomainRoute = (page: StudioPage) => {
    const port = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80)
    useWindowStore.getState().openWindow('tunnels', {
      tab: 'tunnels',
      action: 'createTunnel',
      projectName: page.title || page.slug,
      projectSlug: page.slug,
      projectPort: port,
    })
  }

  const pages = useMemo(() => overviewQ.data?.pages ?? [], [overviewQ.data?.pages])
  const landingCount = useMemo(() => pages.filter((p) => p.kind === 'landing').length, [pages])
  const docsCount = useMemo(() => pages.filter((p) => p.kind === 'docs').length, [pages])

  return {
    t,
    section,
    setSection,
    search,
    setSearch,
    overviewQ,
    refresh,
    pages,
    landingCount,
    docsCount,
    aiReady: Boolean(overviewQ.data?.aiReady),
    aiProvider: overviewQ.data?.aiProvider ?? '',
    aiModel: overviewQ.data?.aiModel ?? '',
    editingPage,
    setEditingPage,
    draftSeed,
    setDraftSeed,
    aiModalOpen,
    setAiModalOpen,
    savePageMut,
    publishMut,
    deletePageMut,
    aiGenMut,
    confirmDeletePage,
    publicUrlOf,
    copyPublicUrl,
    openAiSettings,
    openDomainRoute,
  }
}

export type PageStudioWindowState = ReturnType<typeof usePageStudioWindow>
