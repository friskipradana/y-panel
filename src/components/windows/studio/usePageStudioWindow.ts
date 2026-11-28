import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  chatRefineStudioPage,
  createStudioPage,
  createStudioPageFromChat,
  deleteStudioPage,
  listStudioPages,
  restoreStudioPageVersion,
  toggleStudioPagePublish,
  updateStudioPage,
  type StudioPage,
  type StudioPageInput,
} from '@/api/studio'
import type { RouteSubject } from '@/components/windows/tunnels/RouteDomainModal'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'

const STARTER_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Halaman Baru</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-50 text-slate-900 antialiased">
  <main class="mx-auto max-w-4xl px-6 py-24 text-center">
    <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Mulai Bangun Halaman Anda</h1>
    <p class="mx-auto mt-4 max-w-2xl text-base text-slate-600">
      Gunakan Chat AI di sebelah kiri untuk merancang landing page, portofolio, kalkulator, atau aplikasi web interaktif tanpa batasan layout.
    </p>
  </main>
</body>
</html>`

export function usePageStudioWindow(win: WindowState, authenticated: boolean) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [search, setSearch] = useState('')
  const [activePageId, setActivePageId] = useState<number | null>(null)
  const [domainPage, setDomainPage] = useState<StudioPage | null>(null)

  const overviewQ = useQuery({
    queryKey: ['studio-pages', 'landing'],
    queryFn: () => listStudioPages('landing'),
    enabled: authenticated,
    refetchInterval: pollingActive ? 30_000 : false,
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['studio-pages'] })
  }

  const upsertPageInCache = (page: StudioPage) => {
    qc.setQueryData(['studio-pages', 'landing'], (prev: { pages?: StudioPage[] } | undefined) => {
      if (!prev?.pages) return prev
      const exists = prev.pages.some((p) => p.id === page.id)
      return {
        ...prev,
        pages: exists ? prev.pages.map((p) => (p.id === page.id ? page : p)) : [page, ...prev.pages],
      }
    })
  }

  const createManualMut = useMutation({
    mutationFn: () =>
      createStudioPage({
        kind: 'landing',
        slug: 'halaman-baru',
        title: t('studio.defaultLandingTitle'),
        subtitle: '',
        status: 'draft',
        showInDocs: false,
        brandName: '',
        themeTone: 'blue',
        seoDescription: '',
        ctaLabel: '',
        ctaUrl: '',
        sections: [],
        markdownBody: '',
        htmlCode: STARTER_HTML,
        customDomain: '',
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
    mutationFn: (prompt: string) => createStudioPageFromChat({ kind: 'landing', prompt, language }),
    onSuccess: ({ page }) => {
      upsertPageInCache(page)
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

  const confirmDeletePage = async (page: StudioPage) => {
    const ok = await alertLib.confirm(
      t('studio.deleteTitle'),
      t('studio.deleteConfirm', { name: `${page.title} (/p/${page.slug})` }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.kind,
    )
    if (ok) deletePageMut.mutate(page.id)
  }

  const publicUrlOf = (page: StudioPage) => {
    if (page.customDomain?.trim() && page.status === 'published') {
      return `https://${page.customDomain.trim()}`
    }
    return `${window.location.origin}/p/${page.slug}${page.status !== 'published' ? '?preview=1' : ''}`
  }

  const copyPublicUrl = (page: StudioPage) => {
    const url =
      page.customDomain?.trim() && page.status === 'published'
        ? `https://${page.customDomain.trim()}`
        : `${window.location.origin}/p/${page.slug}`
    void navigator.clipboard.writeText(url).then(() => toast.success(t('studio.urlCopied')))
  }

  const openAiSettings = () => {
    useSettingsNavStore.getState().request('ai_integration')
    useWindowStore.getState().openWindow('settings')
  }

  const agentPort = overviewQ.data?.agentPort || 8787

  const domainSubject: RouteSubject | null = domainPage
    ? {
        id: `studio-page:${domainPage.id}`,
        name: domainPage.slug || domainPage.title,
        kind: 'studio-page',
        linkedHost: domainPage.customDomain || '',
        targets: [
          {
            key: `studio:${agentPort}`,
            host: '127.0.0.1',
            port: agentPort,
            label: `127.0.0.1:${agentPort} → /p/${domainPage.slug}`,
          },
        ],
      }
    : null

  const onDomainConnected = (hostname: string) => {
    if (!domainPage) return
    savePageMut.mutate({
      id: domainPage.id,
      payload: {
        kind: domainPage.kind,
        slug: domainPage.slug,
        title: domainPage.title,
        subtitle: domainPage.subtitle,
        status: 'published',
        showInDocs: false,
        brandName: domainPage.brandName,
        themeTone: domainPage.themeTone,
        seoDescription: domainPage.seoDescription,
        ctaLabel: domainPage.ctaLabel,
        ctaUrl: domainPage.ctaUrl,
        sections: domainPage.sections,
        markdownBody: domainPage.markdownBody,
        htmlCode: domainPage.htmlCode,
        customDomain: hostname,
        sourcePrompt: domainPage.sourcePrompt,
      },
    })
  }

  const pages = useMemo(
    () => (overviewQ.data?.pages ?? []).filter((p) => p.kind === 'landing'),
    [overviewQ.data?.pages],
  )
  const activePage = useMemo(() => pages.find((p) => p.id === activePageId) ?? null, [pages, activePageId])

  return {
    t,
    search,
    setSearch,
    overviewQ,
    refresh,
    pages,
    activePage,
    activePageId,
    setActivePageId,
    domainPage,
    setDomainPage,
    domainSubject,
    onDomainConnected,
    aiReady: Boolean(overviewQ.data?.aiReady),
    createManualMut,
    chatCreateMut,
    chatRefineMut,
    restoreVersionMut,
    savePageMut,
    publishMut,
    deletePageMut,
    confirmDeletePage,
    publicUrlOf,
    copyPublicUrl,
    openAiSettings,
    openDomainRoute: (page: StudioPage) => setDomainPage(page),
  }
}

export type PageStudioWindowState = ReturnType<typeof usePageStudioWindow>
