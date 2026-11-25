import { Plus, RefreshCw, Rocket, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import type { K8sSection, KubernetesWindowState } from './useKubernetesWindow'

export function K8sToolbar({ kw }: { kw: KubernetesWindowState }) {
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
    { key: 'yaml', label: t('k8s.tab.yaml') },
  ]

  const nsOptions = [
    { value: 'all', label: t('k8s.allNamespaces') },
    ...(namespacesQ.data ?? []).map((ns) => ({ value: ns, label: ns })),
  ]

  const showNsPicker = hasCluster && ['pods', 'deployments', 'services', 'configs'].includes(section)
  const showSearch = hasCluster && ['nodes', 'pods', 'deployments', 'services', 'configs'].includes(section)

  return (
    <div className="docker-topbar">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <FilterMenu
          label={t('k8s.sections')}
          items={sectionItems}
          value={section}
          onChange={(v) => setSection(v as K8sSection)}
        />
        {clusterOptions.length > 0 ? (
          <Select
            className="panel-toolbar-select"
            value={activeClusterId}
            onChange={(v) => {
              setSelectedClusterId(v)
              setNamespace('all')
            }}
            options={clusterOptions.map((c) => ({ value: c.id, label: c.label }))}
          />
        ) : null}
        {showNsPicker ? (
          <Select
            className="panel-toolbar-select"
            value={namespace}
            onChange={setNamespace}
            options={nsOptions}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 ml-auto">
        {showSearch ? (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('k8s.searchPlaceholder')}
          />
        ) : null}
        {hasCluster ? (
          <Button
            size="sm"
            variant="primary-soft"
            onClick={() => setDeployPreset({ namespace: namespace === 'all' ? 'default' : namespace })}
          >
            <Rocket className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('k8s.deployWorkload')}</span>
          </Button>
        ) : null}
        <Button size="sm" variant="primary" onClick={() => setAddClusterOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>{t('k8s.addCluster')}</span>
        </Button>
        {activeCluster?.removable ? (
          <IconButton
            size="sm"
            variant="outline"
            label={t('k8s.deleteClusterTitle')}
            onClick={() => void confirmDeleteCluster()}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        <IconButton
          size="sm"
          variant="outline"
          label={t('common.refresh')}
          onClick={invalidateCluster}
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  )
}
