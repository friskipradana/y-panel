import { Plus, RefreshCw, Rocket, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { SearchInput } from '@/components/ui/SearchInput'
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

  const actions = (
    <>
      {hasCluster ? (
        <Button
          variant="primary"
          icon={<Rocket className="h-3.5 w-3.5" strokeWidth={1.75} />}
          onClick={() => setDeployPreset({ namespace: namespace === 'all' ? 'default' : namespace })}
        >
          {t('k8s.deployWorkload')}
        </Button>
      ) : null}
      <Button
        variant={hasCluster ? 'outline' : 'primary'}
        icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
        onClick={() => setAddClusterOpen(true)}
      >
        {t('k8s.addCluster')}
      </Button>
      {activeCluster?.removable ? (
        <IconButton
          variant="outline"
          tone="danger"
          label={t('k8s.deleteClusterTitle')}
          onClick={() => void confirmDeleteCluster()}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </IconButton>
      ) : null}
      <IconButton
        variant="outline"
        label={t('common.refresh')}
        onClick={invalidateCluster}
      >
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
      </IconButton>
    </>
  )

  if (isMobile) {
    return (
      <div className="docker-topbar docker-topbar--mobile">
        <div className="docker-topbar__row flex-wrap">
          <FilterMenu
            label={t('k8s.sections')}
            items={sectionItems}
            value={section}
            onChange={(v) => setSection(v as K8sSection)}
          />
          {clusterSelect}
          {nsSelect}
        </div>
        <div className="docker-topbar__row flex-wrap">
          {showSearch ? (
            <SearchInput
              className="min-w-[140px] flex-1"
              value={search}
              onChange={setSearch}
              placeholder={t('k8s.searchPlaceholder')}
            />
          ) : null}
          {actions}
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
      </div>

      <div className="docker-topbar__right">
        {showSearch ? (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('k8s.searchPlaceholder')}
          />
        ) : null}
        {actions}
      </div>
    </div>
  )
}
