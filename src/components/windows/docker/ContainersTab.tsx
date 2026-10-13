import { fetchContainerConfig } from '@/api/agent'
import { toast } from 'sonner'
import {
  Boxes,
  Container as ContainerIcon,
  Search,
  Layers3,
  Server,
  Trash2,
  RefreshCcw,
  Box,
  Pencil,
  ScrollText,
  Activity,
} from 'lucide-react'
import {
  STATE_STYLES,
  EMPTY_ENV_ROW,
  DEFAULT_COMPOSE_YAML,
  createEmptyRegistryAuth,
  toRawEnv,
  getContainerRuntimeIssues,
  getContainerPorts,
} from './constants'
import { StatusBadge, MetaChip } from './DockerComponents'
import type { DockerWindowState } from './useDockerWindow'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { LoadingState } from '@/components/ui/states'
import { EntityRow } from '@/components/ui/EntityRow'

export function ContainersTab({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    isLoading,
    isError,
    error,
    query,
    setQuery,
    setSearch,
    setShowDeploy,
    setImgInputValue,
    setNetInputValue,
    setDeleteConfirm,
    setLogModal,
    setLogAutoScroll,
    setDeleteOpts,
    setEditContainer,
    editLoading,
    setEditLoading,
    setDeployType,
    setDeployForm,
    startMutation,
    stopMutation,
    restartMutation,
    deleteMutation,
    containers,
    filteredContainers,
    stats,
  } = docker

  return (
    <div className="panel-window__stack">
      <div className="docker-summary-grid">
        <div className="panel-card docker-summary-card">
          <div className="docker-summary-card__icon"><Layers3 className="h-4 w-4" /></div>
          <div>
            <div className="panel-window__meta">{t('docker.totalContainers')}</div>
            <div className="docker-summary-card__value">{containers.length}</div>
          </div>
        </div>
        <div className="panel-card docker-summary-card">
          <div className="docker-summary-card__icon"><Activity className="h-4 w-4" /></div>
          <div>
            <div className="panel-window__meta">{t('docker.running')}</div>
            <div className="docker-summary-card__value">{stats.running}</div>
          </div>
        </div>
        <div className="panel-card docker-summary-card">
          <div className="docker-summary-card__icon"><Server className="h-4 w-4" /></div>
          <div>
            <div className="panel-window__meta">{t('docker.activeIp')}</div>
            <div className="docker-summary-card__value">{stats.withIPs}</div>
          </div>
        </div>
        <div className="panel-card docker-summary-card">
          <div className="docker-summary-card__icon"><Box className="h-4 w-4" /></div>
          <div>
            <div className="panel-window__meta">{t('docker.publishedPorts')}</div>
            <div className="docker-summary-card__value">{stats.withPublishedPorts}</div>
          </div>
        </div>
      </div>

      <div className="panel-table-container">
        <div className="panel-toolbar panel-toolbar--search docker-toolbar-card">
          <form className="panel-search" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()) }}>
            <Search className="h-4 w-4" />
            <input
              id="docker-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="panel-search__input"
              placeholder={t('docker.searchContainers')}
            />
            <Button type="submit" variant="primary-soft">{t('common.search')}</Button>
          </form>
        </div>

        {isLoading ? (
          <LoadingState>{t('docker.connectingAgent')}</LoadingState>
        ) : isError ? (
          <div className="panel-error-state">
            <ContainerIcon className="h-5 w-5" />
            <div>
              <p className="font-semibold">{t('docker.containersLoadFailed')}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.agentAccessHint')}</p>
            </div>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="panel-empty panel-empty--wide">
            <Boxes className="h-8 w-8" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--win-text)]">{t('docker.noContainersMatch')}</div>
              <div>{t('docker.emptyContainersHint')}</div>
            </div>
          </div>
        ) : (
          <>
            {filteredContainers.map((container) => {
              const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
              const stateStyle = STATE_STYLES[container.State] ?? STATE_STYLES.dead
              const runtimeIssues = getContainerRuntimeIssues(container)
              const ActionIcon = stateStyle.actionIcon
              const { primaryPublished, internal, published } = getContainerPorts(container)
              const networks = container.Networks?.length ? container.Networks.join(', ') : 'bridge/default'
              const ipAddresses = container.IpAddresses?.length ? container.IpAddresses.join(', ') : t('docker.unavailable')

              return (
                <EntityRow
                  key={container.Id}
                  title={name}
                  badges={<StatusBadge state={container.State} />}
                  subtitle={container.Image}
                  meta={
                    <>
                      <span className="docker-inline-code">ID {container.Id.slice(0, 12)}</span>
                      <span className="docker-inline-code">Network {networks}</span>
                      <span className="docker-inline-code">IP {ipAddresses}</span>
                      <span className="docker-inline-code">Port {primaryPublished || t('docker.unavailable')}</span>
                      <span className="docker-inline-dot" />
                      <span>{container.Status}</span>
                      {runtimeIssues.map((issue) => (
                        <span key={`${container.Id}-${issue.key}`} className={`panel-badge ${issue.tone === 'danger' ? 'panel-badge--danger' : 'panel-badge--warning'}`}>
                          {issue.label}
                        </span>
                      ))}
                    </>
                  }
                  actions={
                    <>
                      <IconButton
                        type="button" label={t('docker.editRedeploy')}
                        disabled={editLoading}
                        onClick={async () => {
                          setEditLoading(true)
                          try {
                            const cfg = await fetchContainerConfig(container.Id)
                            const envRows = cfg.env.length > 0 ? cfg.env : [EMPTY_ENV_ROW]
                            const envRaw = cfg.envRaw || toRawEnv(envRows)
                            setDeployType('image')
                            setImgInputValue(cfg.image)
                            setNetInputValue('')
                            setDeployForm({
                              ownerUserId: 0,
                              name: cfg.name,
                              image: cfg.image,
                              network: cfg.network || '',
                              ports: cfg.ports.length > 0
                                ? cfg.ports.map((p: any) => ({ hostIp: p.hostIp || '', hostPort: p.hostPort || '', containerPort: p.containerPort || '', protocol: p.protocol || 'tcp' }))
                                : [{ hostPort: '', containerPort: '' }],
                              env: envRows,
                              envMode: cfg.envMode || 'form',
                              envRaw,
                              registryAuth: createEmptyRegistryAuth(),
                              volumes: cfg.volumes.length > 0
                                ? cfg.volumes.map((v: any) => ({ hostPath: v.hostPath, containerPath: v.containerPath }))
                                : [{ hostPath: '', containerPath: '' }],
                              composeYaml: DEFAULT_COMPOSE_YAML,
                            })
                            setEditContainer({ id: container.Id })
                            setShowDeploy(true)
                          } catch {
                            toast.error(t('docker.configLoadFailed'))
                          } finally {
                            setEditLoading(false)
                          }
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        type="button" label={t('docker.viewRealtimeLog')}
                        onClick={() => { setLogAutoScroll(true); setLogModal({ id: container.Id, name }) }}
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        type="button" tone="warning" label={t('docker.restartContainer')}
                        onClick={() => restartMutation.mutate(container.Id)}
                        disabled={restartMutation.isPending}
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                      </IconButton>
                      <button
                        type="button"
                        className={`panel-btn ${stateStyle.btn} min-w-[98px]`}
                        onClick={() => container.State === 'running' ? stopMutation.mutate(container.Id) : startMutation.mutate(container.Id)}
                        disabled={startMutation.isPending || stopMutation.isPending}
                      >
                        <ActionIcon className="h-3.5 w-3.5" />
                        {stateStyle.btnText}
                      </button>
                      <IconButton
                        type="button" label={t('docker.deleteContainer')} className="text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                        onClick={() => {
                          setDeleteOpts({ removeVolumes: false, removeImage: false })
                          setDeleteConfirm({ id: container.Id, name, image: container.Image })
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  }
                  description={
                    internal.length > 1 || published.length > 1 ? (
                      <div className="docker-token-groups docker-token-groups--inline">
                        {internal.length > 1 && (
                          <div className="docker-token-group">
                            <div className="docker-port-section__label">{t('docker.otherInternalPorts')}</div>
                            <div className="docker-token-row">
                              {internal.slice(1).map((value) => <MetaChip key={value} value={value} />)}
                            </div>
                          </div>
                        )}
                        {published.length > 1 && (
                          <div className="docker-token-group">
                            <div className="docker-port-section__label">{t('docker.otherForwards')}</div>
                            <div className="docker-token-row">
                              {published.slice(1).map((value) => <MetaChip key={value} value={value} tone="primary" />)}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null
                  }
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
