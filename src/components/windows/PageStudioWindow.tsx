import { useState } from 'react'
import {
  ArrowUp,
  BookOpen,
  ExternalLink,
  EyeOff,
  Globe,
  LayoutTemplate,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Trash2,
} from 'lucide-react'
import type { WindowState } from '@/types'
import type { StudioPageKind } from '@/api/studio'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { Select } from '@/components/ui/Select'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { StudioBuilderWorkspace } from './studio/StudioBuilderWorkspace'
import { StudioScheduleModal } from './studio/StudioScheduleModal'
import { StudioSchedulesPanel } from './studio/StudioSchedulesPanel'
import { usePageStudioWindow, type StudioKindFilter, type StudioTopSection } from './studio/usePageStudioWindow'

interface PageStudioWindowProps {
  win: WindowState
  authenticated: boolean
}

export function PageStudioWindow({ win, authenticated }: PageStudioWindowProps) {
  const isMobile = useIsMobileLayout()
  const st = usePageStudioWindow(win, authenticated)
  const [quickPrompt, setQuickPrompt] = useState('')
  const [quickKind, setQuickKind] = useState<StudioPageKind>('landing')

  const {
    t,
    section,
    setSection,
    kindFilter,
    setKindFilter,
    search,
    setSearch,
    overviewQ,
    refresh,
    pages,
    schedules,
    activePage,
    setActivePageId,
    landingCount,
    docsCount,
    aiReady,
    createManualMut,
    chatCreateMut,
    publishMut,
    confirmDeletePage,
    publicUrlOf,
    copyPublicUrl,
    openAiSettings,
    openDomainRoute,
  } = st

  if (activePage) {
    return (
      <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
        <StudioBuilderWorkspace st={st} page={activePage} />
      </div>
    )
  }

  if (section === 'schedules') {
    return (
      <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
        <StudioSchedulesPanel st={st} />
        <StudioScheduleModal st={st} />
      </div>
    )
  }

  const topItems = [
    { key: 'pages', label: t('studio.nav.pages'), count: pages.length },
    { key: 'schedules', label: t('studio.nav.schedules'), count: schedules.length },
  ]
  const kindItems = [
    { key: 'all', label: t('studio.tab.all'), count: pages.length },
    { key: 'landing', label: t('studio.kind.landing'), count: landingCount },
    { key: 'docs', label: t('studio.kind.docs'), count: docsCount },
  ]

  const isSpinning = overviewQ.isFetching && !overviewQ.isLoading
  const q = search.trim().toLowerCase()
  const visiblePages = pages.filter((p) => {
    if (kindFilter !== 'all' && p.kind !== kindFilter) return false
    if (!q) return true
    return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q)
  })

  const submitQuickBuild = () => {
    const trimmed = quickPrompt.trim()
    if (!trimmed || chatCreateMut.isPending) return
    if (!aiReady) {
      openAiSettings()
      return
    }
    chatCreateMut.mutate({ kind: quickKind, prompt: trimmed }, { onSuccess: () => setQuickPrompt('') })
  }

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      <div className={`docker-topbar ${isMobile ? 'docker-topbar--mobile' : ''}`}>
        <div className={isMobile ? 'docker-topbar__mobile-row' : 'docker-topbar__left'}>
          <FilterMenu label={t('studio.sections')} value={section} onChange={(v) => setSection(v as StudioTopSection)} items={topItems} />
          <FilterMenu label={t('studio.col.type')} value={kindFilter} onChange={(v) => setKindFilter(v as StudioKindFilter)} items={kindItems} />
          <button
            type="button"
            className="docker-secondary-btn"
            disabled={createManualMut.isPending}
            onClick={() => createManualMut.mutate(kindFilter === 'docs' ? 'docs' : 'landing')}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="docker-secondary-btn__text">{t('studio.newPage')}</span>
          </button>
        </div>

        <div className={isMobile ? 'docker-topbar__mobile-search' : 'docker-topbar__right'}>
          <div className={`docker-search-wrap ${isMobile ? 'docker-search-wrap--mobile' : ''}`}>
            <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
            <input
              type="search"
              className={`docker-search-input ${isMobile ? 'docker-search-input--mobile' : ''}`}
              aria-label={t('studio.searchPh')}
              placeholder={t('studio.searchPh')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={`docker-icon-btn ${isMobile ? 'docker-icon-btn--mobile' : ''}`}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
            onClick={refresh}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Lovable-style quick prompt bar: build directly into live split-pane workspace */}
      <div className="border-b border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36 shrink-0">
            <Select
              size="sm"
              value={quickKind}
              onChange={(v) => setQuickKind(v as StudioPageKind)}
              options={[
                { value: 'landing', label: t('studio.kind.landing') },
                { value: 'docs', label: t('studio.kind.docs') },
              ]}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <TextInput
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              placeholder={t('studio.quickBuildPh')}
              disabled={chatCreateMut.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitQuickBuild()
              }}
            />
          </div>
          {aiReady ? (
            <Button
              size="sm"
              variant="primary"
              loading={chatCreateMut.isPending}
              disabled={!quickPrompt.trim()}
              icon={<ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />}
              onClick={submitQuickBuild}
            >
              {t('studio.quickBuildBtn')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={openAiSettings}>
              {t('studio.aiConfigureBtn')}
            </Button>
          )}
        </div>
      </div>

      <ListTable
        variant="devdesk-docs"
        empty={overviewQ.isLoading || overviewQ.isError || visiblePages.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('studio.col.page') },
          { label: t('studio.col.type') },
          { label: t('studio.col.url') },
          { label: t('docker.colStatus') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={overviewQ.isLoading}
          error={overviewQ.isError}
          errorTitle={t('studio.loadFailed')}
          errorHint={(overviewQ.error as Error)?.message}
          loadingText={t('common.loading')}
          empty={visiblePages.length === 0}
          emptyIcon={<LayoutTemplate />}
          emptyTitle={t('studio.emptyPages')}
        >
          {visiblePages.map((page, idx) => {
            const isPub = page.status === 'published'
            return (
              <div key={page.id} className="docker-row cursor-pointer" onClick={() => setActivePageId(page.id)}>
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon>
                    {page.kind === 'docs' ? (
                      <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                    ) : (
                      <LayoutTemplate className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={page.title}>{page.title}</span>
                    <span className="docker-row__sub">
                      {page.brandName || t(`studio.kind.${page.kind}`)}
                      {page.kind === 'docs' && page.showInDocs ? ` · ${t('studio.syncedDocsBadge')}` : ''}
                      {page.scheduleId > 0 ? ` · ${t('studio.autoBadge')}` : ''}
                    </span>
                    <span className="docker-row__meta panel-mono">/p/{page.slug}</span>
                  </div>
                </div>
                <div className="docker-cell">
                  <Badge tone={page.kind === 'docs' ? 'info' : 'primary'} size="sm">
                    {t(`studio.kind.${page.kind}`)}
                  </Badge>
                </div>
                <div className="docker-cell docker-cell--mono" title={`/p/${page.slug}`}>
                  /p/{page.slug}
                </div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${isPub ? 'running' : 'paused'}`}>
                    <span className="docker-status-dot" />
                    <span>{isPub ? t('studio.status.published') : t('studio.status.draft')}</span>
                  </span>
                </div>
                <div className="docker-action-btns" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`docker-act-btn ${isPub ? '' : 'docker-act-btn--start'}`}
                    title={isPub ? t('studio.unpublishAction') : t('studio.publishAction')}
                    aria-label={isPub ? t('studio.unpublishAction') : t('studio.publishAction')}
                    disabled={publishMut.isPending}
                    onClick={() => publishMut.mutate({ id: page.id, published: !isPub })}
                  >
                    {isPub ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Send className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  </button>
                  <button type="button" className="docker-act-btn" title={t('studio.copyUrl')} aria-label={t('studio.copyUrl')} onClick={() => copyPublicUrl(page)}>
                    <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn"
                    title={t('studio.openLive')}
                    aria-label={t('studio.openLive')}
                    onClick={() => window.open(publicUrlOf(page), '_blank', 'noopener')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className="docker-act-btn" title={t('studio.connectDomain')} aria-label={t('studio.connectDomain')} onClick={() => openDomainRoute(page)}>
                    <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className="docker-act-btn" title={t('studio.openBuilder')} aria-label={t('studio.openBuilder')} onClick={() => setActivePageId(page.id)}>
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={() => void confirmDeletePage(page)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>
    </div>
  )
}
