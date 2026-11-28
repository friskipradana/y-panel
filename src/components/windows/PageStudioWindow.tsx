import { useState } from 'react'
import {
  ArrowUp,
  EyeOff,
  LayoutTemplate,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
} from 'lucide-react'
import type { WindowState } from '@/types'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { RouteDomainModal } from '@/components/windows/tunnels/RouteDomainModal'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { StudioBuilderWorkspace } from './studio/StudioBuilderWorkspace'
import { usePageStudioWindow } from './studio/usePageStudioWindow'

interface PageStudioWindowProps {
  win: WindowState
  authenticated: boolean
}

export function PageStudioWindow({ win, authenticated }: PageStudioWindowProps) {
  const isMobile = useIsMobileLayout()
  const st = usePageStudioWindow(win, authenticated)
  const [quickPrompt, setQuickPrompt] = useState('')

  const {
    t,
    search,
    setSearch,
    overviewQ,
    refresh,
    pages,
    activePage,
    setActivePageId,
    domainSubject,
    setDomainPage,
    onDomainConnected,
    aiReady,
    createManualMut,
    chatCreateMut,
    publishMut,
    deletePageMut,
    confirmDeletePage,
    publicUrlOf,
    copyPublicUrl,
    openAiSettings,
    openDomainRoute,
  } = st

  const domainModal = (
    <RouteDomainModal
      subject={domainSubject}
      onClose={() => setDomainPage(null)}
      onConnected={onDomainConnected}
    />
  )

  if (activePage) {
    return (
      <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
        <StudioBuilderWorkspace st={st} page={activePage} />
        {domainModal}
      </div>
    )
  }

  const isSpinning = overviewQ.isFetching && !overviewQ.isLoading
  const q = search.trim().toLowerCase()
  const visiblePages = pages.filter((p) => {
    if (!q) return true
    return (
      p.title.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.brandName.toLowerCase().includes(q) ||
      (p.customDomain ?? '').toLowerCase().includes(q)
    )
  })

  const submitQuickBuild = () => {
    const trimmed = quickPrompt.trim()
    if (!trimmed || chatCreateMut.isPending) return
    if (!aiReady) {
      openAiSettings()
      return
    }
    chatCreateMut.mutate(trimmed, { onSuccess: () => setQuickPrompt('') })
  }

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      <div className={`docker-topbar ${isMobile ? 'docker-topbar--mobile' : ''}`}>
        <div className={isMobile ? 'docker-topbar__mobile-row' : 'docker-topbar__left'}>
          <button
            type="button"
            className="docker-primary-btn"
            disabled={createManualMut.isPending}
            onClick={() => createManualMut.mutate()}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('studio.newPage')}</span>
          </button>
          {isMobile ? (
            <div className="docker-badge-running docker-badge-running--mobile">
              <span>{t('studio.pageCount', { count: pages.length })}</span>
            </div>
          ) : null}
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
          {!isMobile ? (
            <div className="docker-badge-running">{t('studio.pageCount', { count: pages.length })}</div>
          ) : null}
        </div>
      </div>

      {/* Lovable-style quick prompt bar */}
      <div className="border-b border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
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
        variant="studio-pages"
        empty={overviewQ.isLoading || overviewQ.isError || visiblePages.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('studio.col.page') },
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
            const displayUrl = page.customDomain?.trim() ? `https://${page.customDomain.trim()}` : `/p/${page.slug}`
            const moreItems: ActionMenuItem[] = [
              {
                key: 'open',
                label: t('studio.openLive'),
                onSelect: () => window.open(publicUrlOf(page), '_blank', 'noopener'),
              },
              {
                key: 'copy',
                label: t('studio.copyUrl'),
                onSelect: () => copyPublicUrl(page),
              },
              {
                key: 'domain',
                label: t('studio.connectDomain'),
                onSelect: () => openDomainRoute(page),
              },
              {
                key: 'delete',
                label: t('common.delete'),
                tone: 'danger',
                dividerBefore: true,
                disabled: deletePageMut.isPending,
                onSelect: () => void confirmDeletePage(page),
              },
            ]
            return (
              <div key={page.id} className="docker-row cursor-pointer" onClick={() => setActivePageId(page.id)}>
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon>
                    <LayoutTemplate className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={page.title}>{page.title}</span>
                    {page.brandName ? <span className="docker-row__sub">{page.brandName}</span> : null}
                    <span className="docker-row__meta panel-mono">{displayUrl}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--mono" title={displayUrl}>
                  {displayUrl}
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
                    className={`docker-act-btn ${isPub ? 'docker-act-btn--stop' : 'docker-act-btn--start'}`}
                    title={isPub ? t('studio.unpublishAction') : t('studio.publishAction')}
                    aria-label={isPub ? t('studio.unpublishAction') : t('studio.publishAction')}
                    disabled={publishMut.isPending}
                    onClick={() => publishMut.mutate({ id: page.id, published: !isPub })}
                  >
                    {isPub ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Send className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn"
                    title={t('studio.openBuilder')}
                    aria-label={t('studio.openBuilder')}
                    onClick={() => setActivePageId(page.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <ActionMenu label={t('common.moreActions')} items={moreItems} compact />
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>

      {domainModal}
    </div>
  )
}
