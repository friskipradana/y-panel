import {
  BookOpen,
  Bot,
  ExternalLink,
  Globe,
  LayoutTemplate,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  EyeOff,
} from 'lucide-react'
import type { WindowState } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { StudioAiModal } from './studio/StudioAiModal'
import { StudioEditorModal } from './studio/StudioEditorModal'
import { usePageStudioWindow, type StudioFilterSection } from './studio/usePageStudioWindow'

interface PageStudioWindowProps {
  win: WindowState
  authenticated: boolean
}

export function PageStudioWindow({ win, authenticated }: PageStudioWindowProps) {
  const isMobile = useIsMobileLayout()
  const st = usePageStudioWindow(win, authenticated)
  const {
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
    setEditingPage,
    setDraftSeed,
    setAiModalOpen,
    publishMut,
    confirmDeletePage,
    publicUrlOf,
    copyPublicUrl,
    openDomainRoute,
  } = st

  const filterItems = [
    { key: 'all', label: t('studio.tab.all'), count: pages.length },
    { key: 'landing', label: t('studio.kind.landing'), count: landingCount },
    { key: 'docs', label: t('studio.kind.docs'), count: docsCount },
  ]

  const isSpinning = overviewQ.isFetching && !overviewQ.isLoading
  const q = search.trim().toLowerCase()
  const visiblePages = pages.filter((p) => {
    if (section !== 'all' && p.kind !== section) return false
    if (!q) return true
    return (
      p.title.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.brandName.toLowerCase().includes(q)
    )
  })
  const openNewPage = () => setDraftSeed({ kind: section === 'docs' ? 'docs' : 'landing' })

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            <FilterMenu label={t('studio.sections')} value={section} onChange={(v) => setSection(v as StudioFilterSection)} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={() => setAiModalOpen(true)}>
              <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('studio.aiGenerateShort')}</span>
            </button>
            <button type="button" className="docker-secondary-btn" onClick={openNewPage}>
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('studio.newPageShort')}</span>
            </button>
          </div>
          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('studio.searchPh')}
                placeholder={t('studio.searchPh')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn docker-icon-btn--mobile" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu label={t('studio.sections')} value={section} onChange={(v) => setSection(v as StudioFilterSection)} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={() => setAiModalOpen(true)}>
              <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('studio.aiGenerateBtn')}</span>
            </button>
            <button type="button" className="docker-secondary-btn" onClick={openNewPage}>
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="docker-secondary-btn__text">{t('studio.newPage')}</span>
            </button>
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input"
                aria-label={t('studio.searchPh')}
                placeholder={t('studio.searchPh')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <div className="docker-badge-running">
              <span>{t('docker.itemsBadge', { count: visiblePages.length })}</span>
            </div>
          </div>
        </div>
      )}

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
              <div key={page.id} className="docker-row">
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
                <div className="docker-action-btns">
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
                  <button
                    type="button"
                    className="docker-act-btn"
                    title={t('studio.connectDomain')}
                    aria-label={t('studio.connectDomain')}
                    onClick={() => openDomainRoute(page)}
                  >
                    <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className="docker-act-btn" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => setEditingPage(page)}>
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

      <StudioEditorModal st={st} />
      <StudioAiModal st={st} />
    </div>
  )
}
