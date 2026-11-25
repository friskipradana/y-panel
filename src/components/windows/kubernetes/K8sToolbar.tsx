import { Plus, RefreshCw, Rocket, Search, Trash2 } from 'lucide-react'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { Select } from '@/components/ui/Select'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import type { K8sSection, KubernetesWindowState } from './useKubernetesWindow'

export function K8sToolbar({ kw }: { kw: KubernetesWindowState }) {
  const isMobile = useIsMobileLayout()
  const {
    t,
    section,
    setSection,
    clusterOptions,
    activeClusterId,
    setSelectedClusterId,
    hasCluster,
    namespace,
    setNamespace,
    namespacesQ,
    search,
    setSearch,
    invalidateCluster,
    setAddClusterOpen,
    setDeployPreset,
    confirmDeleteCluster,
  } = kw

  const activeCluster = clusterOptions.find((c) => c.id === activeClusterId)

  const sectionItems: { key: K8sSection; label: string }[] = [
    { key: 'overview', label: t('k8s.tab.overview') },
    { key: 'nodes', label: t('k8s.tab.nodes') },
    { key: 'pods', label: t('k8s.tab.pods') },
    { key: 'deployments', label: t('k8s.tab.deployments') },
    { key: 'services', label: t('k8s.tab.services') },
    { key: 'configs', label: t('k8s.tab.configs') },
    { key: 'storage', label: t('k8s.tab.storage') },
    { key: 'helm', label: t('k8s.tab.helm') },
    { key: 'events', label: t('k8s.tab.events') },
    { key: 'yaml', label: t('k8s.tab.yaml') },
  ]

  const nsOptions = [
    { value: 'all', label: t('k8s.allNamespaces') },
    ...(namespacesQ.data ?? []).map((ns) => ({ value: ns, label: ns })),
  ]

  const showNsPicker = hasCluster && ['pods', 'deployments', 'services', 'configs', 'storage', 'events'].includes(section)
  const showSearch = hasCluster && ['nodes', 'pods', 'deployments', 'services', 'configs', 'storage', 'helm', 'events'].includes(section)

  const clusterSelect =
    clusterOptions.length > 0 ? (
      <Select
        size="sm"
        className="panel-toolbar-select"
        value={activeClusterId}
        onChange={(v) => {
          setSelectedClusterId(v)
          setNamespace('all')
        }}
        options={clusterOptions.map((c) => ({ value: c.id, label: c.label }))}
      />
    ) : null

  const nsSelect = showNsPicker ? (
    <Select
      size="sm"
      searchable={nsOptions.length > 8}
      className="panel-toolbar-select"
      value={namespace}
      onChange={setNamespace}
      options={nsOptions}
    />
  ) : null

  const primaryButton = hasCluster ? (
    <button
      type="button"
      className="docker-primary-btn"
      onClick={() => setDeployPreset({ namespace: namespace === 'all' ? 'default' : namespace })}
    >
      <Rocket className="h-3.5 w-3.5" strokeWidth={1.75} />
      <span>{t('k8s.deployWorkload')}</span>
    </button>
  ) : (
    <button type="button" className="docker-primary-btn" onClick={() => setAddClusterOpen(true)}>
      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
      <span>{t('k8s.addCluster')}</span>
    </button>
  )

  if (isMobile) {
    return (
      <div className="docker-topbar docker-topbar--mobile">
        <div className="docker-topbar__mobile-row">
          <FilterMenu
            label={t('k8s.sections')}
            items={sectionItems}
            value={section}
            onChange={(v) => setSection(v as K8sSection)}
          />
          {primaryButton}
          {clusterSelect}
          {nsSelect}
        </div>
        <div className="docker-topbar__mobile-search">
          {showSearch ? (
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('k8s.searchPlaceholder')}
                placeholder={t('k8s.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {hasCluster ? (
            <button
              type="button"
              className="docker-icon-btn docker-icon-btn--mobile"
              title={t('k8s.addCluster')}
              aria-label={t('k8s.addCluster')}
              onClick={() => setAddClusterOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          {activeCluster?.removable ? (
            <button
              type="button"
              className="docker-icon-btn docker-icon-btn--mobile docker-icon-btn--danger"
              title={t('k8s.deleteClusterTitle')}
              aria-label={t('k8s.deleteClusterTitle')}
              onClick={() => void confirmDeleteCluster()}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          <button
            type="button"
            className="docker-icon-btn docker-icon-btn--mobile"
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
            onClick={invalidateCluster}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left">
        <FilterMenu
          label={t('k8s.sections')}
          items={sectionItems}
          value={section}
          onChange={(v) => setSection(v as K8sSection)}
        />
        {clusterSelect}
        {nsSelect}
        {primaryButton}
        {hasCluster ? (
          <button type="button" className="docker-secondary-btn" onClick={() => setAddClusterOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="docker-secondary-btn__text">{t('k8s.addCluster')}</span>
          </button>
        ) : null}
      </div>

      <div className="docker-topbar__right">
        {showSearch ? (
          <div className="docker-search-wrap">
            <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
            <input
              type="search"
              className="docker-search-input"
              aria-label={t('k8s.searchPlaceholder')}
              placeholder={t('k8s.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null}
        {activeCluster?.removable ? (
          <button
            type="button"
            className="docker-icon-btn docker-icon-btn--danger"
            title={t('k8s.deleteClusterTitle')}
            aria-label={t('k8s.deleteClusterTitle')}
            onClick={() => void confirmDeleteCluster()}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
        <button
          type="button"
          className="docker-icon-btn"
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
          onClick={invalidateCluster}
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
