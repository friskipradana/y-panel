import {
  Box,
  Code2,
  FileText,
  Layers,
  RotateCcw,
  Scaling,
  Server,
  SquareTerminal,
  Terminal,
  Trash2,
} from 'lucide-react'
import { alertLib } from '@/lib/alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { EmptyState } from '@/components/ui/states'
import type { KubernetesWindowState } from './useKubernetesWindow'

function podPill(status: string): 'running' | 'paused' | 'dead' | 'exited' {
  if (status === 'Running' || status === 'Succeeded') return 'running'
  if (status === 'Pending' || status === 'ContainerCreating') return 'paused'
  if (!status) return 'exited'
  return 'dead'
}

export function K8sWorkloadsTab({ kw }: { kw: KubernetesWindowState }) {
  const {
    t,
    section,
    hasCluster,
    search,
    nodesQ,
    podsQ,
    deploymentsQ,
    setLogsPod,
    setExecPod,
    setShellPod,
    setScaleDep,
    setYamlTarget,
    deletePodMut,
    restartDepMut,
    deleteResourceMut,
    setAddClusterOpen,
  } = kw

  const q = search.trim().toLowerCase()

  if (!hasCluster) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <EmptyState icon={<Server />}>{t('k8s.noClusterTitle')}</EmptyState>
        <p className="max-w-md text-[0.75rem] text-[var(--text-secondary)]">{t('k8s.noClusterHint')}</p>
        <Button variant="primary" onClick={() => setAddClusterOpen(true)}>
          {t('k8s.addCluster')}
        </Button>
      </div>
    )
  }

  if (section === 'nodes') {
    const items = (nodesQ.data ?? []).filter((n) => !q || n.name.toLowerCase().includes(q) || n.internalIp.includes(q))
    return (
      <ListTable
        variant="k8s-nodes"
        empty={nodesQ.isLoading || nodesQ.isError || items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('k8s.col.node') },
          { label: t('docker.colStatus') },
          { label: t('docker.colIpAddress') },
          { label: t('k8s.col.capacity') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={nodesQ.isLoading}
          error={nodesQ.isError}
          errorTitle={t('k8s.loadError')}
          errorHint={(nodesQ.error as Error)?.message}
          loadingText={t('k8s.loadingCluster')}
          empty={items.length === 0}
          emptyIcon={<Server />}
          emptyTitle={t('k8s.emptyNodes')}
        >
          {items.map((n, idx) => (
            <div key={n.name} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon><Server className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                <div className="docker-row__text">
                  <div className="docker-row__title">
                    <span className="docker-app-name docker-app-name--mono" title={n.name}>{n.name}</span>
                    <Badge tone="neutral">{n.roles}</Badge>
                  </div>
                  <span className="docker-row__meta panel-mono">{`${n.internalIp} · ${n.version} · CPU ${n.cpu} · RAM ${n.memory}`}</span>
                </div>
              </div>
              <div className="docker-cell--keep">
                <span className={`docker-status-pill docker-status-pill--${n.status === 'Ready' ? 'running' : 'dead'}`}>
                  <span className="docker-status-dot" />
                  <span>{n.status}</span>
                </span>
              </div>
              <div className="docker-cell docker-cell--mono" title={`${n.internalIp} · ${n.version}`}>
                <span>{n.internalIp}</span>
                <span className="text-[0.6875rem] text-[var(--text-secondary)]">{n.version}</span>
              </div>
              <div className="docker-cell docker-cell--mono">
                <span>CPU {n.cpu}</span>
                <span className="text-[0.6875rem] text-[var(--text-secondary)]">RAM {n.memory}</span>
              </div>
              <div className="docker-action-btns">
                <button type="button" className="docker-act-btn" title={t('k8s.viewYaml')} aria-label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'node', namespace: '', name: n.name })}>
                  <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </ListState>
      </ListTable>
    )
  }

  if (section === 'pods') {
    const items = (podsQ.data ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q) || p.status.toLowerCase().includes(q),
    )
    return (
      <ListTable
        variant="k8s-pods"
        empty={podsQ.isLoading || podsQ.isError || items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('k8s.col.pod') },
          { label: t('k8s.col.namespace') },
          { label: t('docker.colStatus') },
          { label: t('k8s.col.readyIp') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={podsQ.isLoading}
          error={podsQ.isError}
          errorTitle={t('k8s.loadError')}
          errorHint={(podsQ.error as Error)?.message}
          loadingText={t('k8s.loadingCluster')}
          empty={items.length === 0}
          emptyIcon={<Box />}
          emptyTitle={t('k8s.emptyPods')}
        >
          {items.map((pod, idx) => (
            <div key={`${pod.namespace}/${pod.name}`} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon><Box className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name docker-app-name--mono" title={pod.name}>{pod.name}</span>
                  <span className="docker-row__sub panel-mono">{pod.nodeName || '-'}</span>
                  <span className="docker-row__meta panel-mono">
                    {`${pod.namespace} · ${pod.ready} · ${pod.podIp || '-'}`}
                  </span>
                </div>
              </div>
              <div className="docker-cell docker-cell--mono">{pod.namespace}</div>
              <div className="docker-cell--keep">
                <span className={`docker-status-pill docker-status-pill--${podPill(pod.status)}`}>
                  <span className="docker-status-dot" />
                  <span>{pod.status}</span>
                </span>
              </div>
              <div className="docker-cell docker-cell--mono" title={t('k8s.podMeta', { ready: pod.ready, restarts: pod.restarts, ip: pod.podIp || '-', node: pod.nodeName || '-' })}>
                <span>{pod.ready} (R:{pod.restarts})</span>
                <span className="text-[0.6875rem] text-[var(--text-secondary)]">{pod.podIp || '-'}</span>
              </div>
              <div className="docker-action-btns">
                <button type="button" className="docker-act-btn" title={t('k8s.logs')} aria-label={t('k8s.logs')} onClick={() => setLogsPod(pod)}>
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button type="button" className="docker-act-btn" title={t('k8s.shell')} aria-label={t('k8s.shell')} onClick={() => setShellPod(pod)}>
                  <SquareTerminal className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button type="button" className="docker-act-btn" title={t('k8s.exec')} aria-label={t('k8s.exec')} onClick={() => setExecPod(pod)}>
                  <Terminal className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button type="button" className="docker-act-btn" title={t('k8s.viewYaml')} aria-label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'pod', namespace: pod.namespace, name: pod.name })}>
                  <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--danger"
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    const ok = await alertLib.confirm(
                      t('k8s.deletePodTitle'),
                      t('k8s.deletePodConfirm', { name: `${pod.namespace}/${pod.name}` }),
                      t('common.delete'),
                      t('common.cancel'),
                      'warning',
                      'kubernetes',
                    )
                    if (ok) deletePodMut.mutate(pod)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </ListState>
      </ListTable>
    )
  }

  // Deployments
  const items = (deploymentsQ.data ?? []).filter(
    (d) => !q || d.name.toLowerCase().includes(q) || d.namespace.toLowerCase().includes(q) || d.image.toLowerCase().includes(q),
  )

  return (
    <ListTable
      variant="k8s-deployments"
      empty={deploymentsQ.isLoading || deploymentsQ.isError || items.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        { label: t('k8s.col.deployment') },
        { label: t('k8s.col.namespace') },
        { label: t('k8s.col.replicas') },
        { label: t('docker.col.image') },
        { label: t('docker.colActions'), actions: true },
      ]}
    >
      <ListState
        loading={deploymentsQ.isLoading}
        error={deploymentsQ.isError}
        errorTitle={t('k8s.loadError')}
        errorHint={(deploymentsQ.error as Error)?.message}
        loadingText={t('k8s.loadingCluster')}
        empty={items.length === 0}
        emptyIcon={<Layers />}
        emptyTitle={t('k8s.emptyDeployments')}
      >
        {items.map((dep, idx) => (
          <div key={`${dep.namespace}/${dep.name}`} className="docker-row">
            <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
            <div className="docker-row__app">
              <ListRowIcon><Layers className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
              <div className="docker-row__text">
                <span className="docker-app-name docker-app-name--mono" title={dep.name}>{dep.name}</span>
                <span className="docker-row__meta panel-mono">{`${dep.namespace} · ${dep.image || '-'}`}</span>
              </div>
            </div>
            <div className="docker-cell docker-cell--mono">{dep.namespace}</div>
            <div className="docker-cell--keep">
              <span className={`docker-status-pill docker-status-pill--${dep.readyReplicas === dep.replicas && dep.replicas > 0 ? 'running' : 'paused'}`}>
                <span className="docker-status-dot" />
                <span>{dep.readyReplicas}/{dep.replicas}</span>
              </span>
            </div>
            <div className="docker-cell docker-cell--mono" title={dep.image || '-'}>{dep.image || '-'}</div>
            <div className="docker-action-btns">
              <button type="button" className="docker-act-btn" title={t('k8s.scale')} aria-label={t('k8s.scale')} onClick={() => setScaleDep(dep)}>
                <Scaling className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button type="button" className="docker-act-btn docker-act-btn--restart" title={t('k8s.rolloutRestart')} aria-label={t('k8s.rolloutRestart')} onClick={() => restartDepMut.mutate(dep)}>
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button type="button" className="docker-act-btn" title={t('k8s.viewYaml')} aria-label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'deployment', namespace: dep.namespace, name: dep.name })}>
                <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="docker-act-btn docker-act-btn--danger"
                title={t('common.delete')}
                aria-label={t('common.delete')}
                onClick={async () => {
                  const ok = await alertLib.confirm(
                    t('k8s.deleteResourceTitle'),
                    t('k8s.deleteResourceConfirm', { name: `${dep.namespace}/${dep.name}` }),
                    t('common.delete'),
                    t('common.cancel'),
                    'warning',
                    'kubernetes',
                  )
                  if (ok) deleteResourceMut.mutate({ kind: 'deployment', ns: dep.namespace, name: dep.name })
                }}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ))}
      </ListState>
    </ListTable>
  )
}
