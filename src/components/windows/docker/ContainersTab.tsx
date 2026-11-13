import { fetchContainerConfig } from '@/api/agent'
import { toast } from 'sonner'
import { alertLib } from '@/lib/alert'
import { localizeServerMessage } from '@/lib/serverMessages'
import {
  Boxes,
  CircleArrowUp,
  Container as ContainerIcon,
  SquarePen,
  Play,
  Square,
  RotateCcw,
  Globe2,
  LoaderCircle,
  ScrollText,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import {
  EMPTY_ENV_ROW,
  DEFAULT_COMPOSE_YAML,
  createEmptyRegistryAuth,
  isDatabaseControl,
  isWaha,
  toRawEnv,
} from './constants'
import type { DockerWindowState } from './useDockerWindow'
import type { Container } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { StatusPill } from './DockerComponents'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/ui/states'
import { ListTable } from '@/components/ui/ListTable'
import { domainTargets } from './domainTargets'

function DockerContainerIcon() {
  return (
    <div className="docker-app-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" />
        <path d="M4 8l8 4 8-4" />
        <path d="M12 12v8" />
      </svg>
    </div>
  )
}

function formatContainerPorts(ports: Container['Ports']): string {
  if (!ports || ports.length === 0) return '-'
  const published = ports.filter((p) => p.PublicPort).map((p) => `:${p.PublicPort}`)
  if (published.length > 0) return Array.from(new Set(published)).join('\n')
  const priv = ports.map((p) => `:${p.PrivatePort}`)
  return Array.from(new Set(priv)).join('\n')
}

function formatContainerIps(ips?: string[]): string {
  if (!ips || ips.length === 0) return '-'
  return ips.join('\n')
}

export function ContainersTab({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    isLoading,
    isError,
    error,
    setShowDeploy,
    setImgInputValue,
    setNetInputValue,
    setDeleteConfirm,
    setLogModal,
    setUpdateTarget,
    setDeleteOpts,
    setEditContainer,
    setDomainContainer,
    editLoading,
    setEditLoading,
    setDeployType,
    setDeployForm,
    startMutation,
    stopMutation,
    restartMutation,
    deleteMutation,
    filteredContainers,
    lists,
    narrowed,
    containersQuery,
  } = docker

  // a refused start, stop or restart says why instead of just staying as it was
  const run = (mutation: { mutate: (id: string, options: { onError: (e: unknown) => void }) => void }, id: string) =>
    mutation.mutate(id, {
      onError: (e) =>
        alertLib.fire(t('docker.actionFailed'), (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('docker.unknownError'), 'error', 'apps'),
    })

  const facets = containersQuery.data?.facets

  const handleEditRedeploy = async (container: Container) => {
    setEditLoading(true)
    try {
      const cfg = await fetchContainerConfig(container.Id)
      const ports = cfg.ports ?? []
      const env = cfg.env ?? []
      const volumes = cfg.volumes ?? []
      const envRows = env.length > 0 ? env : [EMPTY_ENV_ROW]
      const envRaw = cfg.envRaw || toRawEnv(envRows)
      if (cfg.composeYaml) {
        setDeployType('compose')
        setImgInputValue('')
        setNetInputValue('')
        setDeployForm({
          ownerUserId: 0,
          name: cfg.name,
          image: cfg.image,
          network: '',
          ports: [{ hostPort: '', containerPort: '' }],
          env: [EMPTY_ENV_ROW],
          envMode: 'form',
          envRaw: '',
          registryAuth: createEmptyRegistryAuth(),
          volumes: [{ hostPath: '', containerPath: '' }],
          composeYaml: cfg.composeYaml,
        })
      } else {
        setDeployType('image')
        setImgInputValue(cfg.image)
        setNetInputValue('')
        setDeployForm({
          ownerUserId: 0,
          name: cfg.name,
          image: cfg.image,
          network: cfg.network || '',
          ports: ports.length > 0 ? ports.map((p) => ({ hostIp: p.hostIp || '', hostPort: p.hostPort || '', containerPort: p.containerPort || '', protocol: p.protocol || 'tcp' })) : [{ hostPort: '', containerPort: '' }],
          env: envRows,
          envMode: cfg.envMode || 'form',
          envRaw,
          registryAuth: createEmptyRegistryAuth(),
          volumes: volumes.length > 0 ? volumes.map((v) => ({ hostPath: v.hostPath, containerPath: v.containerPath })) : [{ hostPath: '', containerPath: '' }],
          composeYaml: DEFAULT_COMPOSE_YAML,
        })
      }
      setEditContainer({ id: container.Id })
      setShowDeploy(true)
    } catch (e: unknown) {
      const apiErr = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(apiErr ? (localizeServerMessage(apiErr) ?? apiErr) : t('docker.configLoadFailed'))
    } finally {
      setEditLoading(false)
    }
  }

  const renderActions = (container: Container) => {
    const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
    const isRunning = container.State === 'running'
    const isRestarting = container.State === 'restarting'
    const hasPort = domainTargets(container).length > 0
    const busy = [startMutation, stopMutation, restartMutation].some((m) => m.isPending && m.variables === container.Id)
    const isDatabase = container.Labels?.['reneo.kind'] === 'database'
    const isControl = isDatabaseControl(container)
    const isWhatsApp = isWaha(container)
    const isManaged = isDatabase || isControl || isWhatsApp

    return (
      <div className="docker-action-btns">
        {/* Edit and redeploy */}
        <button
          type="button"
          className="docker-act-btn"
          title={t('docker.editRedeploy')}
          aria-label={t('docker.editRedeploy')}
          disabled={editLoading}
          onClick={() => void handleEditRedeploy(container)}
        >
          <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        {/* Start, or Restart and Stop */}
        {busy ? (
          <button type="button" className="docker-act-btn" disabled aria-busy="true" title={t('docker.working')} aria-label={t('docker.working')}>
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          </button>
        ) : !isRunning && !isRestarting ? (
          <button
            type="button"
            className="docker-act-btn docker-act-btn--start"
            title={t('common.start')}
            aria-label={t('common.start')}
            onClick={() => run(startMutation, container.Id)}
          >
            <Play className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
          </button>
        ) : (
          <>
            {isRunning ? (
              <button
                type="button"
                className="docker-act-btn docker-act-btn--restart"
                title={t('docker.restartContainer')}
                aria-label={t('docker.restartContainer')}
                onClick={() => run(restartMutation, container.Id)}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
            <button
              type="button"
              className="docker-act-btn docker-act-btn--stop"
              title={t('common.stop')}
              aria-label={t('common.stop')}
              onClick={() => run(stopMutation, container.Id)}
            >
              <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
            </button>
          </>
        )}

        {/* Download newest image */}
        {isDatabase || container.Image.startsWith('sha256:') ? null : (
          <button
            type="button"
            className="docker-act-btn"
            title={t('docker.update.action')}
            aria-label={t('docker.update.action')}
            onClick={() => setUpdateTarget(isWhatsApp ? { kind: 'waha', name, image: container.Image } : { kind: 'container', id: container.Id, name, image: container.Image })}
          >
            <CircleArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}

        {/* Cloudflare tunnel domain */}
        {isManaged || !hasPort ? null : (
          <button
            type="button"
            className="docker-act-btn"
            title={isRunning ? t('docker.domain.title') : t('docker.domain.needsRunning')}
            aria-label={t('docker.domain.title')}
            disabled={!isRunning}
            onClick={() => setDomainContainer(container)}
          >
            <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}

        {/* Realtime Logs */}
        <button
          type="button"
          className="docker-act-btn"
          title={t('docker.viewRealtimeLog')}
          aria-label={t('docker.viewRealtimeLog')}
          onClick={() => {
            setLogModal({ id: container.Id, name })
          }}
        >
          <ScrollText className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        {/* Delete */}
        {isManaged ? null : (
          <button
            type="button"
            className="docker-act-btn docker-act-btn--danger"
            title={t('docker.deleteContainer')}
            aria-label={t('docker.deleteContainer')}
            disabled={deleteMutation.isPending}
            onClick={() => {
              setDeleteOpts({ removeVolumes: false, removeImage: false })
              setDeleteConfirm({
                id: container.Id,
                name,
                image: container.Image,
              })
            }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    )
  }

  if (docker.viewMode === 'grid') {
    return (
      <div className="app-catalog-cards-scroll">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 my-auto min-h-[240px]">
            <LoadingState>{t('docker.connectingAgent')}</LoadingState>
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 my-auto min-h-[240px]">
            <div className="panel-error-state max-w-md w-full">
              <ContainerIcon className="h-5 w-5" strokeWidth={1.75} />
              <div>
                <p className="font-semibold">{t('docker.containersLoadFailed')}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.agentAccessHint')}</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<RefreshCw size={12} />}
                onClick={() => void containersQuery.refetch()}
              >
                {t('common.retry')}
              </Button>
            </div>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 my-auto min-h-[240px]">
            <div className="panel-empty panel-empty--wide">
              <Boxes className="h-8 w-8" strokeWidth={1.75} />
              <div className="space-y-1">
                <div className="text-sm font-medium text-[var(--win-text)]">{narrowed ? t('docker.noResults') : t('docker.noContainersMatch')}</div>
                {narrowed ? null : <div>{t('docker.emptyContainersHint')}</div>}
              </div>
            </div>
          </div>
        ) : (
          <div className="app-catalog-card-grid">
            {filteredContainers.map((container) => {
              const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
              const isDatabase = container.Labels?.['reneo.kind'] === 'database'
              const isControl = isDatabaseControl(container)
              const isWhatsApp = isWaha(container)
              const portsText = formatContainerPorts(container.Ports)
              const ipText = formatContainerIps(container.IpAddresses)
              const stack = container.ProjectName || container.Labels?.['com.docker.compose.project'] || ''

              return (
                <article key={container.Id} className="app-catalog-card">
                  <div className="space-y-2.5 min-w-0">
                    <div className="app-catalog-card__head">
                      <div className="app-catalog-card__identity">
                        <DockerContainerIcon />
                        <div className="app-catalog-card__titles">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="docker-app-name truncate" title={name}>{name}</span>
                            {isDatabase ? (
                              <Badge tone="info" size="sm" title={t('docker.databaseHint')}>{t('docker.databaseBadge')}</Badge>
                            ) : isControl ? (
                              <Badge tone="info" size="sm" title={t('docker.databaseControlHint')}>{t('docker.databaseControlBadge')}</Badge>
                            ) : isWhatsApp ? (
                              <Badge tone="info" size="sm" title={t('docker.wahaHint')}>{t('docker.wahaBadge')}</Badge>
                            ) : null}
                          </div>
                          <span className="docker-row__sub panel-mono truncate" title={container.Image}>
                            {container.Image}{stack ? ` · ${stack}` : ''}
                          </span>
                        </div>
                      </div>
                      <StatusPill state={container.State} />
                    </div>

                    <div className="space-y-1 text-xs">
                      {portsText !== '-' ? (
                        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                          <span className="opacity-70 shrink-0">{t('docker.colPort')}:</span>
                          <span className="panel-mono text-[var(--win-text)] truncate" title={portsText}>{portsText.replace(/\n/g, ' ')}</span>
                        </div>
                      ) : null}
                      {ipText !== '-' ? (
                        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                          <span className="opacity-70 shrink-0">{t('docker.colIpAddress')}:</span>
                          <span className="panel-mono text-[var(--win-text)] truncate" title={ipText}>{ipText.replace(/\n/g, ', ')}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="app-catalog-card__footer">
                    {renderActions(container)}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <ListTable
      variant="containers"
      empty={isLoading || isError || filteredContainers.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        lists.containers.column('name', t('docker.colContainerService'), facets?.name),
        lists.containers.column('state', t('docker.colStatus'), facets?.state),
        { label: t('docker.colIpAddress') },
        lists.containers.column('port', t('docker.colPort'), facets?.port),
        { label: t('docker.colActions'), actions: true },
      ]}
    >
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 my-auto min-h-[240px]">
            <LoadingState>{t('docker.connectingAgent')}</LoadingState>
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 my-auto min-h-[240px]">
            <div className="panel-error-state max-w-md w-full">
              <ContainerIcon className="h-5 w-5" strokeWidth={1.75} />
              <div>
                <p className="font-semibold">{t('docker.containersLoadFailed')}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.agentAccessHint')}</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<RefreshCw size={12} />}
                onClick={() => void containersQuery.refetch()}
              >
                {t('common.retry')}
              </Button>
            </div>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 my-auto min-h-[240px]">
            <div className="panel-empty panel-empty--wide">
              <Boxes className="h-8 w-8" strokeWidth={1.75} />
              <div className="space-y-1">
                <div className="text-sm font-medium text-[var(--win-text)]">{narrowed ? t('docker.noResults') : t('docker.noContainersMatch')}</div>
                {narrowed ? null : <div>{t('docker.emptyContainersHint')}</div>}
              </div>
            </div>
          </div>
        ) : (
          filteredContainers.map((container, idx) => {
            const name =
              container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
            const isDatabase = container.Labels?.['reneo.kind'] === 'database'
            const isControl = isDatabaseControl(container)
            const isWhatsApp = isWaha(container)
            const portsText = formatContainerPorts(container.Ports)
            const ipText = formatContainerIps(container.IpAddresses)
            const stack = container.ProjectName || container.Labels?.['com.docker.compose.project'] || ''
            const indexStr = String(idx + 1).padStart(2, '0')

            return (
              <div key={container.Id} className="docker-row">
                {/* Column 1: Index */}
                <div className="docker-row__num">{indexStr}</div>

                {/* Column 2: Container & Service */}
                <div className="docker-row__app">
                  <DockerContainerIcon />
                  <div className="docker-row__text">
                    <span className="docker-row__title">
                      <span className="docker-app-name" title={name}>
                        {name}
                      </span>
                      {isDatabase ? (
                        <Badge tone="info" title={t('docker.databaseHint')}>
                          {t('docker.databaseBadge')}
                        </Badge>
                      ) : isControl ? (
                        <Badge tone="info" title={t('docker.databaseControlHint')}>
                          {t('docker.databaseControlBadge')}
                        </Badge>
                      ) : isWhatsApp ? (
                        <Badge tone="info" title={t('docker.wahaHint')}>
                          {t('docker.wahaBadge')}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="docker-row__sub">{container.Image}{stack ? ` · ${stack}` : ''}</span>
                    <span className="docker-row__meta">{container.Image}{ipText !== '-' ? ` · ${ipText.replace(/\n/g, ', ')}` : ''}{portsText !== '-' ? ` · ${portsText.replace(/\n/g, ' ')}` : ''}</span>
                  </div>
                </div>

                {/* Column 3: Status */}
                <div className="docker-cell--keep"><StatusPill state={container.State} /></div>

                {/* Column 4: IP Address */}
                <div className="docker-ip-text" title={ipText !== '-' ? ipText.replace(/\n/g, ', ') : undefined}>{ipText}</div>

                {/* Column 5: Port */}
                <div className="docker-port-text">{portsText}</div>

                {/* Column 6: Actions */}
                {renderActions(container)}
              </div>
            )
          })
        )}
    </ListTable>
  )
}
