import { fetchContainerConfig } from '@/api/agent'
import { toast } from 'sonner'
import { alertLib } from '@/lib/alert'
import {
  Boxes,
  Container as ContainerIcon,
  SquarePen,
  Play,
  Square,
  RotateCcw,
  Globe2,
  LoaderCircle,
  ScrollText,
  Trash2,
} from 'lucide-react'
import {
  EMPTY_ENV_ROW,
  DEFAULT_COMPOSE_YAML,
  createEmptyRegistryAuth,
  isDatabaseControl,
  toRawEnv,
} from './constants'
import type { DockerWindowState } from './useDockerWindow'
import type { Container } from '@/types'
import { Badge } from '@/components/ui/Badge'
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
  const published = ports
    .filter((p) => p.PublicPort)
    .map((p) => `:${p.PublicPort}`)
  if (published.length > 0) {
    return Array.from(new Set(published)).join('\n')
  }
  const priv = ports.map((p) => `:${p.PrivatePort}`)
  return Array.from(new Set(priv)).join('\n')
}

function renderStatusPill(state: string) {
  const norm = state.toLowerCase()
  if (norm === 'running') {
    return (
      <span className="docker-status-pill docker-status-pill--running">
        <span className="docker-status-dot" />
        <span>Running</span>
      </span>
    )
  }
  if (norm === 'exited' || norm === 'stopped') {
    return (
      <span className="docker-status-pill docker-status-pill--exited">
        <span className="docker-status-dot" />
        <span>exited</span>
      </span>
    )
  }
  if (norm === 'paused') {
    return (
      <span className="docker-status-pill docker-status-pill--paused">
        <span className="docker-status-dot" />
        <span>paused</span>
      </span>
    )
  }
  if (norm === 'restarting') {
    return (
      <span className="docker-status-pill docker-status-pill--restarting">
        <span className="docker-status-dot" />
        <span>restarting</span>
      </span>
    )
  }
  return (
    <span className="docker-status-pill docker-status-pill--dead">
      <span className="docker-status-dot" />
      <span>{norm || 'dead'}</span>
    </span>
  )
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
        ports:
          cfg.ports.length > 0
            ? cfg.ports.map((p: any) => ({
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
        volumes:
          cfg.volumes.length > 0
            ? cfg.volumes.map((v: any) => ({
                hostPath: v.hostPath,
                containerPath: v.containerPath,
              }))
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
  }

  return (
    <ListTable
      variant="containers"
      empty={isLoading || isError || filteredContainers.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        lists.containers.column('name', t('docker.colContainerService'), facets?.name),
        lists.containers.column('state', t('docker.colStatus'), facets?.state),
        lists.containers.column('port', t('docker.colPort'), facets?.port),
        { label: t('docker.colActions'), actions: true },
      ]}
    >
        {isLoading ? (
          <div className="p-8">
            <LoadingState>{t('docker.connectingAgent')}</LoadingState>
          </div>
        ) : isError ? (
          <div className="p-6">
            <div className="panel-error-state">
              <ContainerIcon className="h-5 w-5" strokeWidth={1.75} />
              <div>
                <p className="font-semibold">{t('docker.containersLoadFailed')}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.agentAccessHint')}</p>
              </div>
            </div>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="p-8">
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
            const isRunning = container.State === 'running'
            const isRestarting = container.State === 'restarting'
            // a tunnel needs a port to point at; without one the button would lead nowhere
            const hasPort = domainTargets(container).length > 0
            // only this container's own action counts, not another row's
            const busy = [startMutation, stopMutation, restartMutation].some((m) => m.isPending && m.variables === container.Id)
            const isDatabase = container.Labels?.['reneo.kind'] === 'database'
            const isControl = isDatabaseControl(container)
            // made and kept by the Database window: no domain, no delete here
            const isManaged = isDatabase || isControl
            const portsText = formatContainerPorts(container.Ports)
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
                      ) : null}
                    </span>
                    <span className="docker-row__sub">{container.Image}{stack ? ` · ${stack}` : ''}</span>
                        <span className="docker-row__meta">{container.Image}{portsText !== '-' ? ` · ${portsText.replace(/\n/g, ' ')}` : ''}</span>
                  </div>
                </div>

                {/* Column 3: Status */}
                <div className="docker-cell--keep">{renderStatusPill(container.State)}</div>

                {/* Column 4: Port */}
                <div className="docker-port-text">{portsText}</div>

                {/* Column 5: Actions */}
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

                  {/* Start, or Restart and Stop. While one of them runs on this container the buttons give way
                      to a spinner, so a second click cannot land and a stopped container shows no Stop */}
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

                  {/* Point a domain at this container through a Cloudflare tunnel; a database is not a website */}
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

                  {/* Delete (non-database) */}
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
              </div>
            )
          })
        )}
    </ListTable>
  )
}
