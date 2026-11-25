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
import { EntityRow } from '@/components/ui/EntityRow'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import type { KubernetesWindowState } from './useKubernetesWindow'

function podTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'Running' || status === 'Succeeded') return 'success'
  if (status === 'Pending' || status === 'ContainerCreating') return 'warning'
  if (!status) return 'neutral'
  return 'danger'
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
    if (nodesQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (nodesQ.isError) {
      return (
        <div className="p-6">
          <ErrorState
            title={t('k8s.loadError')}
            hint={(nodesQ.error as Error)?.message}
            action={<Button size="sm" variant="ghost" onClick={() => void nodesQ.refetch()}>{t('common.refresh')}</Button>}
          />
        </div>
      )
    }
    const items = (nodesQ.data ?? []).filter((n) => !q || n.name.toLowerCase().includes(q) || n.internalIp.includes(q))
    if (items.length === 0) return <div className="p-6"><EmptyState icon={<Server />}>{t('k8s.emptyNodes')}</EmptyState></div>

    return (
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {items.map((n) => (
          <EntityRow
            key={n.name}
            centered
            leading={<ListRowIcon><Server className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
            title={<span className="panel-mono">{n.name}</span>}
            badges={
              <>
                <Badge tone={n.status === 'Ready' ? 'success' : 'danger'} dot>{n.status}</Badge>
                <Badge tone="neutral">{n.roles}</Badge>
              </>
            }
            subtitle={<span className="panel-mono">{n.internalIp} · {n.version} · CPU {n.cpu} · RAM {n.memory}</span>}
            actions={
              <IconButton size="sm" variant="ghost" label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'node', namespace: '', name: n.name })}>
                <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            }
          />
        ))}
      </div>
    )
  }

  if (section === 'pods') {
    if (podsQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (podsQ.isError) {
      return (
        <div className="p-6">
          <ErrorState
            title={t('k8s.loadError')}
            hint={(podsQ.error as Error)?.message}
            action={<Button size="sm" variant="ghost" onClick={() => void podsQ.refetch()}>{t('common.refresh')}</Button>}
          />
        </div>
      )
    }
    const items = (podsQ.data ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q) || p.status.toLowerCase().includes(q),
    )
    if (items.length === 0) return <div className="p-6"><EmptyState icon={<Box />}>{t('k8s.emptyPods')}</EmptyState></div>

    return (
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {items.map((pod) => (
          <EntityRow
            key={`${pod.namespace}/${pod.name}`}
            centered
            leading={<ListRowIcon><Box className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
            title={<span className="panel-mono">{pod.name}</span>}
            badges={
              <>
                <Badge tone={podTone(pod.status)} dot>{pod.status}</Badge>
                <Badge tone="neutral">{pod.namespace}</Badge>
              </>
            }
            subtitle={
              <span className="panel-mono">
                {t('k8s.podMeta', { ready: pod.ready, restarts: pod.restarts, ip: pod.podIp || '-', node: pod.nodeName || '-' })}
              </span>
            }
            actions={
              <>
                <IconButton size="sm" variant="ghost" label={t('k8s.logs')} onClick={() => setLogsPod(pod)}>
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
                <IconButton size="sm" variant="ghost" label={t('k8s.shell')} onClick={() => setShellPod(pod)}>
                  <SquareTerminal className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
                <IconButton size="sm" variant="ghost" label={t('k8s.exec')} onClick={() => setExecPod(pod)}>
                  <Terminal className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
                <IconButton size="sm" variant="ghost" label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'pod', namespace: pod.namespace, name: pod.name })}>
                  <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  tone="danger"
                  label={t('common.delete')}
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
                </IconButton>
              </>
            }
          />
        ))}
      </div>
    )
  }

  // Deployments
  if (deploymentsQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
  if (deploymentsQ.isError) {
    return (
      <div className="p-6">
        <ErrorState
          title={t('k8s.loadError')}
          hint={(deploymentsQ.error as Error)?.message}
          action={<Button size="sm" variant="ghost" onClick={() => void deploymentsQ.refetch()}>{t('common.refresh')}</Button>}
        />
      </div>
    )
  }
  const items = (deploymentsQ.data ?? []).filter(
    (d) => !q || d.name.toLowerCase().includes(q) || d.namespace.toLowerCase().includes(q) || d.image.toLowerCase().includes(q),
  )
  if (items.length === 0) return <div className="p-6"><EmptyState icon={<Layers />}>{t('k8s.emptyDeployments')}</EmptyState></div>

  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
      {items.map((dep) => (
        <EntityRow
          key={`${dep.namespace}/${dep.name}`}
          centered
          leading={<ListRowIcon><Layers className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
          title={<span className="panel-mono">{dep.name}</span>}
          badges={
            <>
              <Badge tone={dep.readyReplicas === dep.replicas && dep.replicas > 0 ? 'success' : 'warning'} dot>
                {dep.readyReplicas}/{dep.replicas}
              </Badge>
              <Badge tone="neutral">{dep.namespace}</Badge>
            </>
          }
          subtitle={<span className="panel-mono">{dep.image || '-'}</span>}
          actions={
            <>
              <IconButton size="sm" variant="ghost" label={t('k8s.scale')} onClick={() => setScaleDep(dep)}>
                <Scaling className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('k8s.rolloutRestart')} onClick={() => restartDepMut.mutate(dep)}>
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'deployment', namespace: dep.namespace, name: dep.name })}>
                <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                tone="danger"
                label={t('common.delete')}
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
              </IconButton>
            </>
          }
        />
      ))}
    </div>
  )
}
