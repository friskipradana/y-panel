import { RefreshCw, Plus, ChevronDown, Search, Check } from 'lucide-react'
import { DOCKER_TABS, type DockerTab } from './constants'
import type { DockerWindowState } from './useDockerWindow'

export function DockerToolbar({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    activeTab,
    setActiveTab,
    refreshAll,
    isFetching,
    openDeployModal,
    setShowPullImage,
    setShowCreateNet,
    setShowCreateTpl,
    query,
    setQuery,
    containers,
    stats,
    imagesData,
    networksData,
    volumesData,
    templatesData,
    tabDropdownOpen,
    setTabDropdownOpen,
    tabDropdownRef,
  } = docker

  // The main action follows the open tab; the volume list is read-only, so it has none
  const primary: Partial<Record<DockerTab, { label: string; run: () => void }>> = {
    containers: { label: t('docker.deploy'), run: openDeployModal },
    images: { label: t('docker.pullImage'), run: () => setShowPullImage(true) },
    networks: { label: t('docker.createNetwork'), run: () => setShowCreateNet(true) },
    templates: { label: t('docker.createTemplate'), run: () => setShowCreateTpl(true) },
  }
  const action = primary[activeTab]

  const counts: Record<DockerTab, number> = {
    containers: containers.length,
    images: imagesData?.items.length ?? 0,
    networks: networksData?.items.length ?? 0,
    volumes: volumesData?.items.length ?? 0,
    templates: templatesData?.items.length ?? 0,
  }

  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left">
        <div className="docker-dropdown-wrap" ref={tabDropdownRef}>
          <button type="button" className="docker-dropdown-btn" onClick={() => setTabDropdownOpen(!tabDropdownOpen)} aria-expanded={tabDropdownOpen} aria-haspopup="menu">
            <span>{t(`docker.tab.${activeTab}`)}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-75" strokeWidth={1.75} />
          </button>
          {tabDropdownOpen && (
            <div className="docker-dropdown-menu" role="menu">
              {DOCKER_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="menuitem"
                  className={`docker-dropdown-item ${activeTab === tab ? 'docker-dropdown-item--active' : ''}`}
                  onClick={() => {
                    setActiveTab(tab)
                    setTabDropdownOpen(false)
                  }}
                >
                  <span>{t(`docker.tab.${tab}`)}</span>
                  {activeTab === tab ? <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> : <span className="docker-dropdown-item__count">{counts[tab]}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {action ? (
          <button type="button" onClick={action.run} className="docker-primary-btn">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{action.label}</span>
          </button>
        ) : null}
      </div>

      <div className="docker-topbar__right">
        <div className="docker-search-wrap">
          <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
          <input
            id="docker-toolbar-search"
            type="text"
            className="docker-search-input"
            aria-label={t(`docker.search.${activeTab}`)}
            placeholder={t(`docker.search.${activeTab}`)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <button type="button" className="docker-icon-btn" title={t('docker.refresh')} aria-label={t('docker.refresh')} onClick={refreshAll}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>

        <div className="docker-badge-running">
          {activeTab === 'containers' ? t('docker.runningSummaryBadge', { running: stats.running, total: containers.length }) : t('docker.itemsBadge', { count: counts[activeTab] })}
        </div>
      </div>
    </div>
  )
}
