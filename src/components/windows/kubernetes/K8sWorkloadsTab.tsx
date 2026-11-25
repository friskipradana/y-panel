import { useState } from 'react'
import {
  Activity,
  Box,
  Code2,
  FileCode2,
  FileText,
  Globe2,
  KeyRound,
  Layers,
  Network,
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
import { Field, Textarea } from '@/components/ui/Field'
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
    namespace,
    search,
    nodesQ,
    podsQ,
    deploymentsQ,
    servicesQ,
    configsQ,
    eventsQ,
    setLogsPod,
    setExecPod,
    setShellPod,
    setScaleDep,
    setYamlTarget,
    deletePodMut,
    restartDepMut,
    applyYamlMut,
    deleteResourceMut,
    openTunnelForService,
    setAddClusterOpen,
  } = kw

  const [yamlDraft, setYamlDraft] = useState('')
  const q = search.trim().toLowerCase()

  if (!hasCluster) {
    return (
      <div className="p-4 flex-1 flex flex-col items-center justify-center gap-3 text-center">
        <EmptyState icon={<Server />}>{t('k8s.noClusterTitle')}</EmptyState>
        <p className="max-w-md text-[12px] text-[var(--text-secondary)]">{t('k8s.noClusterHint')}</p>
        <Button size="sm" variant="primary" onClick={() => setAddClusterOpen(true)}>
          {t('k8s.addCluster')}
        </Button>
      </div>
    )
  }

  if (section === 'yaml') {
    return (
      <div className="p-3.5 space-y-3 overflow-y-auto flex-1">
        <Field label={t('k8s.yamlApplyTitle')} hint={t('k8s.yamlApplyHint')}>
          <Textarea
            rows={14}
            className="panel-input--mono"
            value={yamlDraft}
            onChange={(e) => setYamlDraft(e.target.value)}
            placeholder={t('k8s.yamlPlaceholder')}
          />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!yamlDraft.trim() || applyYamlMut.isPending}
            onClick={() => setYamlDraft('')}
          >
            {t('common.clear')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!yamlDraft.trim()}
            loading={applyYamlMut.isPending}
            onClick={() => applyYamlMut.mutate({ ns: namespace === 'all' ? 'default' : namespace, yaml: yamlDraft })}
          >
            <FileCode2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('k8s.applyYaml')}</span>
          </Button>
        </div>
      </div>
    )
  }

  if (section === 'nodes') {
    if (nodesQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (nodesQ.isError) {
      return (
        <div className="p-4">
          <ErrorState
            title={t('k8s.loadError')}
            hint={(nodesQ.error as Error)?.message}
            action={<Button size="sm" variant="ghost" onClick={() => void nodesQ.refetch()}>{t('common.refresh')}</Button>}
          />
        </div>
      )
    }
    const items = (nodesQ.data ?? []).filter((n) => !q || n.name.toLowerCase().includes(q) || n.internalIp.includes(q))
    if (items.length === 0) return <div className="p-4"><EmptyState icon={<Server />}>{t('k8s.emptyNodes')}</EmptyState></div>

    return (
      <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
        {items.map((n) => (
          <div key={n.name} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <ListRowIcon><Server className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)] truncate">{n.name}</span>
                  <Badge tone={n.status === 'Ready' ? 'success' : 'danger'}>{n.status}</Badge>
                  <Badge tone="neutral">{n.roles}</Badge>
                </div>
                <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                  {n.internalIp} · {n.version} · CPU {n.cpu} · RAM {n.memory}
                </p>
              </div>
            </div>
            <IconButton
              size="sm"
              variant="ghost"
              label={t('k8s.viewYaml')}
              onClick={() => setYamlTarget({ kind: 'node', namespace: '', name: n.name })}
            >
              <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        ))}
      </div>
    )
  }

  if (section === 'pods') {
    if (podsQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (podsQ.isError) {
      return (
        <div className="p-4">
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
    if (items.length === 0) return <div className="p-4"><EmptyState icon={<Box />}>{t('k8s.emptyPods')}</EmptyState></div>

    return (
      <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
        {items.map((pod) => (
          <div key={`${pod.namespace}/${pod.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ListRowIcon><Box className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)] truncate">{pod.name}</span>
                  <Badge tone={podTone(pod.status)}>{pod.status}</Badge>
                  <Badge tone="neutral">{pod.namespace}</Badge>
                </div>
                <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                  {t('k8s.podMeta', { ready: pod.ready, restarts: pod.restarts, ip: pod.podIp || '-', node: pod.nodeName || '-' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <IconButton size="sm" variant="ghost" label={t('k8s.logs')} onClick={() => setLogsPod(pod)}>
                <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('k8s.shell')} onClick={() => setShellPod(pod)}>
                <SquareTerminal className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton size="sm" variant="ghost" label={t('k8s.exec')} onClick={() => setExecPod(pod)}>
                <Terminal className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                label={t('k8s.viewYaml')}
                onClick={() => setYamlTarget({ kind: 'pod', namespace: pod.namespace, name: pod.name })}
              >
                <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
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
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (section === 'deployments') {
    if (deploymentsQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (deploymentsQ.isError) {
      return (
        <div className="p-4">
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
    if (items.length === 0) return <div className="p-4"><EmptyState icon={<Layers />}>{t('k8s.emptyDeployments')}</EmptyState></div>

    return (
      <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
        {items.map((dep) => (
          <div key={`${dep.namespace}/${dep.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ListRowIcon><Layers className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)] truncate">{dep.name}</span>
                  <Badge tone={dep.readyReplicas === dep.replicas && dep.replicas > 0 ? 'success' : 'warning'}>
                    {dep.readyReplicas}/{dep.replicas}
                  </Badge>
                  <Badge tone="neutral">{dep.namespace}</Badge>
                </div>
                <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">{dep.image || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <IconButton size="sm" variant="ghost" label={t('k8s.scale')} onClick={() => setScaleDep(dep)}>
                <Scaling className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                label={t('k8s.rolloutRestart')}
                onClick={() => restartDepMut.mutate(dep)}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                label={t('k8s.viewYaml')}
                onClick={() => setYamlTarget({ kind: 'deployment', namespace: dep.namespace, name: dep.name })}
              >
                <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
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
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (section === 'services') {
    if (servicesQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (servicesQ.isError) {
      return (
        <div className="p-4">
          <ErrorState
            title={t('k8s.loadError')}
            hint={(servicesQ.error as Error)?.message}
            action={<Button size="sm" variant="ghost" onClick={() => void servicesQ.refetch()}>{t('common.refresh')}</Button>}
          />
        </div>
      )
    }
    const svcs = (servicesQ.data?.services ?? []).filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.namespace.toLowerCase().includes(q) || s.type.toLowerCase().includes(q),
    )
    const ingresses = (servicesQ.data?.ingresses ?? []).filter(
      (ig) => !q || ig.name.toLowerCase().includes(q) || ig.hosts.some((h) => h.toLowerCase().includes(q)),
    )
    if (svcs.length === 0 && ingresses.length === 0) return <div className="p-4"><EmptyState icon={<Network />}>{t('k8s.emptyServices')}</EmptyState></div>

    return (
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        <div className="space-y-1.5">
          {svcs.map((svc) => {
            const portSummary = svc.ports
              .map((p) => (p.nodePort > 0 ? `${p.port}:${p.nodePort}/${p.protocol}` : `${p.port}/${p.protocol}`))
              .join(', ')
            return (
              <div key={`${svc.namespace}/${svc.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <ListRowIcon><Network className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)] truncate">{svc.name}</span>
                      <Badge tone={svc.type === 'NodePort' || svc.type === 'LoadBalancer' ? 'primary' : 'neutral'}>{svc.type}</Badge>
                      <Badge tone="neutral">{svc.namespace}</Badge>
                    </div>
                    <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                      {svc.clusterIp || '-'} · {portSummary || '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openTunnelForService(svc)}>
                    <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>{t('k8s.exposeTunnel')}</span>
                  </Button>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={t('k8s.viewYaml')}
                    onClick={() => setYamlTarget({ kind: 'service', namespace: svc.namespace, name: svc.name })}
                  >
                    <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                </div>
              </div>
            )
          })}
        </div>

        {ingresses.length > 0 ? (
          <div className="space-y-1.5 pt-2 border-t border-[var(--win-border)]">
            <p className="panel-section-label">{t('k8s.ingressesTitle')}</p>
            {ingresses.map((ig) => (
              <div key={`${ig.namespace}/${ig.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)]">{ig.name}</span>
                    <Badge tone="info">{ig.className || 'ingress'}</Badge>
                    <Badge tone="neutral">{ig.namespace}</Badge>
                  </div>
                  <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">{ig.hosts.join(', ') || '-'}</p>
                </div>
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={t('k8s.viewYaml')}
                  onClick={() => setYamlTarget({ kind: 'ingress', namespace: ig.namespace, name: ig.name })}
                >
                  <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (section === 'events') {
    if (eventsQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (eventsQ.isError) {
      return (
        <div className="p-4">
          <ErrorState
            title={t('k8s.loadError')}
            hint={(eventsQ.error as Error)?.message}
            action={<Button size="sm" variant="ghost" onClick={() => void eventsQ.refetch()}>{t('common.refresh')}</Button>}
          />
        </div>
      )
    }
    const evs = (eventsQ.data ?? []).filter(
      (e) =>
        !q ||
        e.reason.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        e.objectName.toLowerCase().includes(q) ||
        e.namespace.toLowerCase().includes(q),
    )
    if (evs.length === 0) return <div className="p-4"><EmptyState icon={<Activity />}>{t('k8s.emptyEvents')}</EmptyState></div>

    return (
      <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
        {evs.map((ev, idx) => (
          <div key={`${ev.namespace}/${ev.objectName}/${ev.reason}/${idx}`} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <ListRowIcon><Activity className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={ev.type === 'Warning' ? 'warning' : 'success'}>{ev.reason || ev.type}</Badge>
                  <span className="panel-mono text-[12.5px] font-semibold text-[var(--win-text)] truncate">
                    {ev.objectKind}/{ev.objectName}
                  </span>
                  {ev.namespace ? <Badge tone="neutral">{ev.namespace}</Badge> : null}
                  {ev.count > 1 ? <Badge tone="info">x{ev.count}</Badge> : null}
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--text-secondary)] break-words">{ev.message}</p>
              </div>
            </div>
            {ev.lastSeen ? (
              <span className="panel-mono shrink-0 text-[11px] text-[var(--text-secondary)]">
                {new Date(ev.lastSeen).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  // ConfigMaps & Secrets
  if (configsQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
  if (configsQ.isError) {
    return (
      <div className="p-4">
        <ErrorState
          title={t('k8s.loadError')}
          hint={(configsQ.error as Error)?.message}
          action={<Button size="sm" variant="ghost" onClick={() => void configsQ.refetch()}>{t('common.refresh')}</Button>}
        />
      </div>
    )
  }
  const cfgs = (configsQ.data ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.namespace.toLowerCase().includes(q) || c.kind.toLowerCase().includes(q),
  )
  if (cfgs.length === 0) return <div className="p-4"><EmptyState icon={<KeyRound />}>{t('k8s.emptyConfigs')}</EmptyState></div>

  return (
    <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
      {cfgs.map((c) => (
        <div key={`${c.kind}/${c.namespace}/${c.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <ListRowIcon><KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)] truncate">{c.name}</span>
                <Badge tone={c.kind === 'Secret' ? 'warning' : 'info'}>{c.kind}</Badge>
                <Badge tone="neutral">{c.namespace}</Badge>
              </div>
              <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                {c.keys.length > 0 ? c.keys.join(', ') : t('k8s.noDataKeys')}
              </p>
            </div>
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            label={t('k8s.viewYaml')}
            onClick={() => setYamlTarget({ kind: c.kind.toLowerCase(), namespace: c.namespace, name: c.name })}
          >
            <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
