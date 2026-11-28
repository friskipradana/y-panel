import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  chatRefineStudioPage,
  createStudioPage,
  createStudioPageFromChat,
  createStudioSchedule,
  deleteStudioPage,
  deleteStudioSchedule,
  listStudioPages,
  listStudioSchedules,
  restoreStudioPageVersion,
  runStudioScheduleNow,
  toggleStudioPagePublish,
  toggleStudioSchedule,
  updateStudioPage,
  updateStudioSchedule,
  type StudioPage,
  type StudioPageInput,
  type StudioPageKind,
  type StudioSchedule,
  type StudioScheduleInput,
} from '@/api/studio'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'

export type StudioTopSection = 'pages' | 'schedules'
export type StudioKindFilter = 'all' | 'landing' | 'docs'

export function usePageStudioWindow(win: WindowState, authenticated: boolean) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [section, setSection] = useState<StudioTopSection>('pages')
  const [kindFilter, setKindFilter] = useState<StudioKindFilter>('all')
  const [search, setSearch] = useState('')
  const [activePageId, setActivePageId] = useState<number | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<StudioSchedule | 'new' | null>(null)
  const [runningScheduleId, setRunningScheduleId] = useState<number | null>(null)

  const overviewQ = useQuery({
    queryKey: ['studio-pages'],
    queryFn: () => listStudioPages(),
    enabled: authenticated,
    refetchInterval: pollingActive ? 30_000 : false,
  })

  const schedulesQ = useQuery({
    queryKey: ['studio-schedules'],
    queryFn: listStudioSchedules,
    enabled: authenticated,
    refetchInterval: pollingActive ? 30_000 : false,
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['studio-pages'] })
    void qc.invalidateQueries({ queryKey: ['studio-schedules'] })
    void qc.invalidateQueries({ queryKey: ['docs'] })
  }

  const upsertPageInCache = (page: StudioPage) => {
    qc.setQueryData(['studio-pages'], (prev: { pages?: StudioPage[] } | undefined) => {
      if (!prev?.pages) return prev
      const exists = prev.pages.some((p) => p.id === page.id)
      return {
        ...prev,
        pages: exists ? prev.pages.map((p) => (p.id === page.id ? page : p)) : [page, ...prev.pages],
      }
    })
  }

  const createManualMut = useMutation({
    mutationFn: (kind: StudioPageKind) =>
      createStudioPage({
        kind,
        slug: kind === 'docs' ? 'panduan-baru' : 'halaman-baru',
        title: kind === 'docs' ? t('studio.defaultDocTitle') : t('studio.defaultLandingTitle'),
        subtitle: '',
        status: 'draft',
        showInDocs: kind === 'docs',
        brandName: 'Reneo',
        themeTone: 'blue',
        seoDescription: '',
        ctaLabel: kind === 'landing' ? t('studio.defaultCtaLabel') : '',
        ctaUrl: '',
        sections: [],
        markdownBody: kind === 'docs' ? `## ${t('studio.defaultDocHeading')}\n\n` : '',
        sourcePrompt: '',
      }),
    onSuccess: (page) => {
      upsertPageInCache(page)
      setActivePageId(page.id)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const chatCreateMut = useMutation({
    mutationFn: (payload: { kind: StudioPageKind; prompt: string }) =>
      createStudioPageFromChat({ ...payload, language }),
    onSuccess: ({ page }) => {
      upsertPageInCache(page)
      setSection('pages')
      setActivePageId(page.id)
      toast.success(t('studio.aiGeneratedOk'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const chatRefineMut = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      chatRefineStudioPage(id, { message, language }),
    onSuccess: ({ page }) => {
      upsertPageInCache(page)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const restoreVersionMut = useMutation({
    mutationFn: ({ id, versionId }: { id: number; versionId: string }) =>
      restoreStudioPageVersion(id, versionId),
    onSuccess: ({ page }) => {
      upsertPageInCache(page)
      toast.success(t('studio.versionRestored'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const savePageMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: StudioPageInput }) =>
      updateStudioPage(id, payload),
    onSuccess: (page) => {
      upsertPageInCache(page)
      toast.success(
        page.status === 'published'
          ? t('studio.savedPublished', { slug: page.slug })
          : t('studio.savedDraft', { title: page.title }),
      )
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const publishMut = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) =>
      toggleStudioPagePublish(id, published),
    onSuccess: (page) => {
      upsertPageInCache(page)
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
    onSuccess: (_res, id) => {
      if (activePageId === id) setActivePageId(null)
      toast.success(t('studio.deletedToast'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveScheduleMut = useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: StudioScheduleInput }) =>
      id ? updateStudioSchedule(id, payload) : createStudioSchedule(payload),
    onSuccess: () => {
      toast.success(t('studio.schedule.savedToast'))
      setEditingSchedule(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleScheduleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      toggleStudioSchedule(id, enabled),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteScheduleMut = useMutation({
    mutationFn: deleteStudioSchedule,
    onSuccess: () => {
      toast.success(t('studio.schedule.deletedToast'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runScheduleMut = useMutation({
    mutationFn: async (id: number) => {
      setRunningScheduleId(id)
      try {
        return await runStudioScheduleNow(id)
      } finally {
        setRunningScheduleId(null)
      }
    },
    onSuccess: ({ page }) => {
      upsertPageInCache(page)
      toast.success(t('studio.schedule.runSuccessToast', { title: page.title }))
      refresh()
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

  const confirmDeleteSchedule = async (sc: StudioSchedule) => {
    const ok = await alertLib.confirm(
      t('studio.schedule.deleteTitle'),
      t('studio.schedule.deleteConfirm', { name: sc.name }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteScheduleMut.mutate(sc.id)
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
  const schedules = useMemo(() => schedulesQ.data?.schedules ?? [], [schedulesQ.data?.schedules])
  const activePage = useMemo(() => pages.find((p) => p.id === activePageId) ?? null, [pages, activePageId])
  const landingCount = useMemo(() => pages.filter((p) => p.kind === 'landing').length, [pages])
  const docsCount = useMemo(() => pages.filter((p) => p.kind === 'docs').length, [pages])

  return {
    t,
    section,
    setSection,
    kindFilter,
    setKindFilter,
    search,
    setSearch,
    overviewQ,
    schedulesQ,
    refresh,
    pages,
    schedules,
    activePage,
    activePageId,
    setActivePageId,
    landingCount,
    docsCount,
    aiReady: Boolean(overviewQ.data?.aiReady),
    aiProvider: overviewQ.data?.aiProvider ?? '',
    aiModel: overviewQ.data?.aiModel ?? '',
    editingSchedule,
    setEditingSchedule,
    runningScheduleId,
    createManualMut,
    chatCreateMut,
    chatRefineMut,
    restoreVersionMut,
    savePageMut,
    publishMut,
    deletePageMut,
    saveScheduleMut,
    toggleScheduleMut,
    runScheduleMut,
    confirmDeletePage,
    confirmDeleteSchedule,
    publicUrlOf,
    copyPublicUrl,
    openAiSettings,
    openDomainRoute,
  }
}

export type PageStudioWindowState = ReturnType<typeof usePageStudioWindow>
