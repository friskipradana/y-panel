import { useMemo, useState } from 'react'
import {
  Activity,
  Box,
  Boxes,
  Container as ContainerIcon,
  Layers3,
  Pencil,
  RefreshCcw,
  RefreshCw,
  Search,
  Server,
  Trash2,
  ScrollText,
} from 'lucide-react'
import type { Container } from '@/types'

import { fetchContainerConfig } from '@/api/agent'
import { toast } from 'sonner'
import { STATE_STYLES, getContainerRuntimeIssues, getContainerPorts, isContainerAttention, createEmptyRegistryAuth, toRawEnv, EMPTY_ENV_ROW, DEFAULT_COMPOSE_YAML } from './constants'
import { StatusBadge, MetaChip } from './DockerComponents'
import { useI18n } from '@/lib/i18n'
import type { UseMutationResult } from '@tanstack/react-query'

interface ContainersTabProps {
  containers: Container[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  search: string
  setSearch: (v: string) => void
  query: string
  setQuery: (v: string) => void
  startMutation: UseMutationResult<any, any, any>
  stopMutation: UseMutationResult<any, any, any>
  restartMutation: UseMutationResult<any, any, any>
  deleteMutation: UseMutationResult<any, any, any>
  onEditContainer: (id: string, deployForm: any, deployType: string, imgInputValue: string) => void
  onOpenLog: (id: string, name: string) => void
  onDeleteConfirm: (id: string, name: string, image: string) => void
}

export function ContainersTab({
  containers,
  isLoading,
  isError,
  error,
  search,
  setSearch,
  query,
  setQuery,
  startMutation,
  stopMutation,
  restartMutation,
  deleteMutation,
  onEditContainer,
  onOpenLog,
  onDeleteConfirm,
}: ContainersTabProps) {
  const [editLoading, setEditLoading] = useState(false)
  const { t } = useI18n()

  const filteredContainers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return containers
    return containers.filter((container) => {
      const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
      const networks = (container.Networks ?? []).join(' ')
      const ips = (container.IpAddresses ?? []).join(' ')
      const ports = (container.Ports ?? []).map((port) => `${port.PublicPort ?? ''} ${port.PrivatePort} ${port.Type}`).join(' ')
      return [name, container.Image, container.State, container.Status, container.Id, container.Health, container.RestartCount ? `restart ${container.RestartCount}` : '', networks, ips, ports]
        .filter((value): value is string => value !== undefined && value !== null && value !== '')
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [containers, search])

  const stats = useMemo(() => {
    const running = containers.filter((c) => c.State === 'running').length
    const stopped = containers.filter((c) => ['exited', 'dead'].includes(c.State)).length
    const attention = containers.filter((c) => isContainerAttention(c)).length
    const withPublishedPorts = containers.filter((c) => (c.Ports ?? []).some((p) => p.PublicPort)).length
    const withIPs = containers.filter((c) => (c.IpAddresses ?? []).length > 0).length
    return { running, stopped, attention, withPublishedPorts, withIPs }
  }, [containers])

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
          <form
            className="panel-search"
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(query.trim())
            }}
          >
            <Search className="h-4 w-4" />
            <input
              id="docker-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="panel-search__input"
              placeholder={t('docker.searchContainers')}
            />
            <button type="submit" className="panel-btn panel-btn--primary-soft">{t('docker.search')}</button>
          </form>
        </div>

        {isLoading ? (
          <div className="panel-loading">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('docker.connectingAgent')}
          </div>
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
                <div key={container.Id} className="panel-table-row">
                  <div className="docker-container-row__main">
                    <div className="docker-container-row__header">
                      <div className="docker-container-card__title-wrap">
                        <div className="docker-container-card__title-row">
                          <span className="docker-container-card__title">{name}</span>
                          <StatusBadge state={container.State} />
                        </div>
                        <div className="docker-container-card__subtitle">{container.Image}</div>
                        <div className="docker-container-card__meta-row">
                          <span className="docker-inline-code">ID {container.Id.slice(0, 12)}</span>
                          <span className="docker-inline-code">Network {networks}</span>
                          <span className="docker-inline-code">IP {ipAddresses}</span>
                          <span className="docker-inline-code">Port {primaryPublished || t('docker.unavailable')}</span>
                          <span className="docker-inline-dot" />
                          <span>{container.Status}</span>
                          {runtimeIssues.map((issue) => (
                            <span
                              key={`${container.Id}-${issue.key}`}
                              className={`panel-badge ${issue.tone === 'danger' ? 'panel-badge--danger' : 'panel-badge--warning'}`}
                            >
                              {issue.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="docker-container-row__actions">
                        <button
                          type="button"
                          className="panel-icon-btn"
                          title={t('docker.editRedeploy')}
                          disabled={editLoading}
                          onClick={async () => {
                            setEditLoading(true)
                            try {
                              const cfg = await fetchContainerConfig(container.Id)
                              const envRows = cfg.env.length > 0 ? cfg.env : [EMPTY_ENV_ROW]
                              const envRaw = cfg.envRaw || toRawEnv(envRows)
                              const deployForm = {
                                ownerUserId: 0,
                                name: cfg.name,
                                image: cfg.image,
                                network: cfg.network || '',
                                ports: cfg.ports.length > 0
                                  ? cfg.ports.map((p) => ({
                                      hostIp: p.hostIp || '',
                                      hostPort: p.hostPort || '',
                                      containerPort: p.containerPort || '',
                                      protocol: p.protocol || 'tcp',
                                    }))
                                  : [{ hostPort: '', containerPort: '' }],
                                env: envRows,
                                envMode: cfg.envMode || 'form',
                                envRaw,
                                registryAuth: createEmptyRegistryAuth(),
                                volumes: cfg.volumes.length > 0
                                  ? cfg.volumes.map((v) => ({ hostPath: v.hostPath, containerPath: v.containerPath }))
                                  : [{ hostPath: '', containerPath: '' }],
                                composeYaml: DEFAULT_COMPOSE_YAML,
                              }
                              onEditContainer(container.Id, deployForm, 'image', cfg.image)
                            } catch {
                              toast.error(t('docker.configLoadFailed'))
                            } finally {
                              setEditLoading(false)
                            }
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="panel-icon-btn"
                          title={t('docker.viewRealtimeLog')}
                          onClick={() => onOpenLog(container.Id, name)}
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="panel-icon-btn panel-icon-btn--warning"
                          onClick={() => restartMutation.mutate(container.Id)}
                          disabled={restartMutation.isPending}
                          title={t('docker.restartContainer')}
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={`panel-btn ${stateStyle.btn} min-w-[98px]`}
                          onClick={() => container.State === 'running' ? stopMutation.mutate(container.Id) : startMutation.mutate(container.Id)}
                          disabled={startMutation.isPending || stopMutation.isPending}
                        >
                          <ActionIcon className="h-3.5 w-3.5" />
                          {stateStyle.btnText}
                        </button>
                        <button
                          type="button"
                          className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                          onClick={() => onDeleteConfirm(container.Id, name, container.Image)}
                          disabled={deleteMutation.isPending}
                          title={t('docker.deleteContainer')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {(internal.length > 1 || published.length > 1) && (
                      <div className="docker-token-groups docker-token-groups--inline">
                        {internal.length > 1 && (
                          <div className="docker-token-group">
                            <div className="docker-port-section__label">{t('docker.otherInternalPorts')}</div>
                            <div className="docker-token-row">
                              {internal.slice(1).map((value) => (
                                <MetaChip key={value} value={value} />
                              ))}
                            </div>
                          </div>
                        )}
                        {published.length > 1 && (
                          <div className="docker-token-group">
                            <div className="docker-port-section__label">{t('docker.otherForwards')}</div>
                            <div className="docker-token-row">
                              {published.slice(1).map((value) => (
                                <MetaChip key={value} value={value} tone="primary" />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}




