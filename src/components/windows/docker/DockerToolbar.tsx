import { RefreshCw, Plus, Search } from 'lucide-react'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { DOCKER_TABS, type DockerTab } from './constants'
import type { DockerWindowState } from './useDockerWindow'

export function DockerToolbar({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    activeTab,
    setActiveTab,
    refreshAll,
    isFetching,
    isLoading,
    openDeployModal,
    setShowPullImage,
    setShowCreateNet,
    setShowCreateTpl,
    current,
    stats,
    imagesData,
    networksData,
    volumesData,
    templatesData,
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
    containers: stats.all,
    images: imagesData?.all ?? 0,
    networks: networksData?.all ?? 0,
    volumes: volumesData?.all ?? 0,
    templates: templatesData?.all ?? 0,
  }

  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left">
        <FilterMenu
          label={t('docker.tabs')}
          value={activeTab}
          onChange={(key) => setActiveTab(key as DockerTab)}
          items={DOCKER_TABS.map((tab) => ({ key: tab, label: t(`docker.tab.${tab}`), count: counts[tab] }))}
        />

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
            value={current.text}
            onChange={(e) => current.setText(e.target.value)}
          />
        </div>

        <button type="button" className="docker-icon-btn" title={t('docker.refresh')} aria-label={t('docker.refresh')} onClick={refreshAll}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching && !isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>

        <div className="docker-badge-running">
          {activeTab === 'containers' ? t('docker.runningSummaryBadge', { running: stats.running, total: stats.all }) : t('docker.itemsBadge', { count: counts[activeTab] })}
        </div>
      </div>
    </div>
  )
}
