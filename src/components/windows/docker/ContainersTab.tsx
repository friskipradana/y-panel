import { useState } from 'react'
import { fetchContainerConfig } from '@/api/agent'
import { pinContainerStaticIP } from '@/api/docker'
import { toast } from 'sonner'
import { alertLib } from '@/lib/alert'
import { localizeServerMessage } from '@/lib/serverMessages'
import { Play, Square, LoaderCircle, ScrollText } from 'lucide-react'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
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
import { ListTable } from '@/components/ui/ListTable'
import { domainTargets } from './domainTargets'
import {
  ContainerGridView,
  ContainerStatePlaceholder,
  DockerContainerIcon,
  formatContainerIps,
  formatContainerPorts,
} from './ContainerGridView'

export function ContainersTab({ docker }: { docker: DockerWindowState }) {
  const [pinningId, setPinningId] = useState<string | null>(null)
  const {
    t,
    refetch,
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
        alertLib.fire(
          t('docker.actionFailed'),
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('docker.unknownError'),
          'error',
          'apps',
        ),
    })

  const facets = containersQuery.data?.facets

  const handlePinStaticIp = async (container: Container, name: string) => {
    setPinningId(container.Id)
    try {
      const res = await pinContainerStaticIP(container.Id)
      toast.success(t('docker.pinStaticIpSuccess', { ip: res.ip, name, network: res.network }))
      void refetch()
    } catch (e: unknown) {
      const apiErr = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(apiErr ? (localizeServerMessage(apiErr) ?? apiErr) : (e instanceof Error ? e.message : t('docker.unknownError')))
    } finally {
      setPinningId(null)
    }
  }

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
          staticIp: '',
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
          staticIp: cfg.staticIp || '',
          ports:
            ports.length > 0
              ? ports.map((p) => ({
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
    const busy =
      pinningId === container.Id ||
      [startMutation, stopMutation, restartMutation].some((m) => m.isPending && m.variables === container.Id)
    const isDatabase = container.Labels?.['reneo.kind'] === 'database'
    const isControl = isDatabaseControl(container)
    const isWhatsApp = isWaha(container)
    const isManaged = isDatabase || isControl || isWhatsApp
    const hasStatic = (container.StaticIps?.length ?? 0) > 0

    const moreItems: ActionMenuItem[] = [
      {
        key: 'edit',
        label: t('docker.editRedeploy'),
        disabled: editLoading,
        onSelect: () => void handleEditRedeploy(container),
      },
      ...(!hasStatic
        ? [
            {
              key: 'pin-ip',
              label: t('docker.pinStaticIp'),
              disabled: busy,
              onSelect: () => void handlePinStaticIp(container, name),
            },
          ]
        : []),
      ...(isRunning
        ? [
            {
              key: 'restart',
              label: t('docker.restartContainer'),
              disabled: busy,
              onSelect: () => run(restartMutation, container.Id),
            },
          ]
        : []),
      ...(isDatabase || container.Image.startsWith('sha256:')
        ? []
        : [
            {
              key: 'update',
              label: t('docker.update.action'),
              onSelect: () =>
                setUpdateTarget(
                  isWhatsApp
                    ? { kind: 'waha', name, image: container.Image }
                    : { kind: 'container', id: container.Id, name, image: container.Image },
                ),
            },
          ]),
      ...(isManaged || !hasPort
        ? []
        : [
            {
              key: 'domain',
              label: isRunning ? t('docker.domain.title') : t('docker.domain.needsRunning'),
              disabled: !isRunning,
              onSelect: () => setDomainContainer(container),
            },
          ]),
      ...(isManaged
        ? []
        : [
            {
              key: 'delete',
              label: t('docker.deleteContainer'),
              tone: 'danger' as const,
              dividerBefore: true,
              disabled: deleteMutation.isPending,
              onSelect: () => {
                setDeleteOpts({ removeVolumes: false, removeImage: false })
                setDeleteConfirm({ id: container.Id, name, image: container.Image })
              },
            },
          ]),
    ]

    return (
      <div className="docker-action-btns">
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
          <button
            type="button"
            className="docker-act-btn docker-act-btn--stop"
            title={t('common.stop')}
            aria-label={t('common.stop')}
            onClick={() => run(stopMutation, container.Id)}
          >
            <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
          </button>
        )}

        <button
          type="button"
          className="docker-act-btn"
          title={t('docker.viewRealtimeLog')}
          aria-label={t('docker.viewRealtimeLog')}
          onClick={() => setLogModal({ id: container.Id, name })}
        >
          <ScrollText className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        <ActionMenu label={t('common.moreActions')} items={moreItems} compact />
      </div>
    )
  }

  if (docker.viewMode === 'grid') {
    return (
      <ContainerGridView
        t={t}
        isLoading={isLoading}
        isError={isError}
        error={error}
        narrowed={narrowed}
        containers={filteredContainers}
        onRetry={() => void containersQuery.refetch()}
        renderActions={renderActions}
      />
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
      {isLoading || isError || filteredContainers.length === 0 ? (
        <ContainerStatePlaceholder
          t={t}
          isLoading={isLoading}
          isError={isError}
          error={error}
          narrowed={narrowed}
          onRetry={() => void containersQuery.refetch()}
        />
      ) : (
        filteredContainers.map((container, idx) => {
          const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
          const stack = container.ProjectName || container.Labels?.['com.docker.compose.project'] || ''
          const isDatabase = container.Labels?.['reneo.kind'] === 'database'
          const isControl = isDatabaseControl(container)
          const isWhatsApp = isWaha(container)
          const isAppCatalog =
            container.Labels?.['reneo.kind'] === 'app-catalog' ||
            name.startsWith('reneo-app-') ||
            stack.startsWith('reneo-app-')
          const portsText = formatContainerPorts(container.Ports)
          const hasStatic = (container.StaticIps?.length ?? 0) > 0
          const ipText = formatContainerIps(hasStatic ? container.StaticIps : container.IpAddresses)
          const indexStr = String(idx + 1).padStart(2, '0')

          return (
            <div key={container.Id} className="docker-row">
              <div className="docker-row__num">{indexStr}</div>
              <div className="docker-row__app">
                <DockerContainerIcon />
                <div className="docker-row__text">
                  <span className="docker-row__title">
                    <span className="docker-app-name" title={name}>{name}</span>
                    {isDatabase ? (
                      <Badge tone="info" title={t('docker.databaseHint')}>{t('docker.databaseBadge')}</Badge>
                    ) : isControl ? (
                      <Badge tone="info" title={t('docker.databaseControlHint')}>{t('docker.databaseControlBadge')}</Badge>
                    ) : isWhatsApp ? (
                      <Badge tone="info" title={t('docker.wahaHint')}>{t('docker.wahaBadge')}</Badge>
                    ) : isAppCatalog ? (
                      <Badge tone="info" title={t('docker.appCatalogHint')}>{t('docker.appCatalogBadge')}</Badge>
                    ) : null}
                  </span>
                  <span className="docker-row__sub">{container.Image}{stack ? ` · ${stack}` : ''}</span>
                  <span className="docker-row__meta">
                    {container.Image}
                    {ipText !== '-' ? ` · ${ipText.replace(/\n/g, ', ')}` : ''}
                    {portsText !== '-' ? ` · ${portsText.replace(/\n/g, ' ')}` : ''}
                  </span>
                </div>
              </div>
              <div className="docker-cell--keep"><StatusPill state={container.State} /></div>
              <div className="docker-ip-text flex flex-col items-start gap-1" title={ipText !== '-' ? ipText.replace(/\n/g, ', ') : undefined}>
                <span>{ipText}</span>
                {ipText !== '-' ? (
                  <Badge tone={hasStatic ? 'success' : 'neutral'} size="sm">
                    {hasStatic ? t('docker.ipStaticBadge') : t('docker.ipDynamicBadge')}
                  </Badge>
                ) : null}
              </div>
              <div className="docker-port-text">{portsText}</div>
              {renderActions(container)}
            </div>
          )
        })
      )}
    </ListTable>
  )
}
