import { useState } from 'react'
import { Activity, Code2, FileCode2, Globe2, KeyRound, Network, Server } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { Field, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import type { KubernetesWindowState } from './useKubernetesWindow'

export function K8sNetworkAndConfigTab({ kw }: { kw: KubernetesWindowState }) {
  const {
    t,
    section,
    hasCluster,
    namespace,
    search,
    servicesQ,
    configsQ,
    eventsQ,
    setYamlTarget,
    applyYamlMut,
    openTunnelForService,
    setAddClusterOpen,
  } = kw

  const [yamlDraft, setYamlDraft] = useState('')
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

  if (section === 'yaml') {
    return (
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-4">
        <Field label={t('k8s.yamlApplyTitle')} hint={t('k8s.yamlApplyHint')}>
          <Textarea
            mono
            rows={14}
            value={yamlDraft}
            onChange={(e) => setYamlDraft(e.target.value)}
            placeholder={t('k8s.yamlPlaceholder')}
          />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            disabled={!yamlDraft.trim() || applyYamlMut.isPending}
            onClick={() => setYamlDraft('')}
          >
            {t('common.clear')}
          </Button>
          <Button
            variant="primary"
            icon={<FileCode2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
            disabled={!yamlDraft.trim()}
            loading={applyYamlMut.isPending}
            onClick={() => applyYamlMut.mutate({ ns: namespace === 'all' ? 'default' : namespace, yaml: yamlDraft })}
          >
            {t('k8s.applyYaml')}
          </Button>
        </div>
      </div>
    )
  }

  if (section === 'services') {
    if (servicesQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (servicesQ.isError) {
      return (
        <div className="p-6">
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
    if (svcs.length === 0 && ingresses.length === 0) return <div className="p-6"><EmptyState icon={<Network />}>{t('k8s.emptyServices')}</EmptyState></div>

    return (
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-1.5">
          {svcs.map((svc) => {
            const portSummary = svc.ports
              .map((p) => (p.nodePort > 0 ? `${p.port}:${p.nodePort}/${p.protocol}` : `${p.port}/${p.protocol}`))
              .join(', ')
            return (
              <EntityRow
                key={`${svc.namespace}/${svc.name}`}
                centered
                leading={<ListRowIcon><Network className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
                title={<span className="panel-mono">{svc.name}</span>}
                badges={
                  <>
                    <Badge tone={svc.type === 'NodePort' || svc.type === 'LoadBalancer' ? 'primary' : 'neutral'}>{svc.type}</Badge>
                    <Badge tone="neutral">{svc.namespace}</Badge>
                  </>
                }
                subtitle={<span className="panel-mono">{svc.clusterIp || '-'} · {portSummary || '-'}</span>}
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                      onClick={() => openTunnelForService(svc)}
                    >
                      {t('k8s.exposeTunnel')}
                    </Button>
                    <IconButton size="sm" variant="ghost" label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'service', namespace: svc.namespace, name: svc.name })}>
                      <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                  </>
                }
              />
            )
          })}
        </div>

        {ingresses.length > 0 ? (
          <div className="space-y-1.5 border-t border-[var(--win-border)] pt-2.5">
            <p className="panel-section-label">{t('k8s.ingressesTitle')}</p>
            {ingresses.map((ig) => (
              <EntityRow
                key={`${ig.namespace}/${ig.name}`}
                centered
                title={<span className="panel-mono">{ig.name}</span>}
                badges={
                  <>
                    <Badge tone="info">{ig.className || 'ingress'}</Badge>
                    <Badge tone="neutral">{ig.namespace}</Badge>
                  </>
                }
                subtitle={<span className="panel-mono">{ig.hosts.join(', ') || '-'}</span>}
                actions={
                  <IconButton size="sm" variant="ghost" label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'ingress', namespace: ig.namespace, name: ig.name })}>
                    <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (section === 'events') {
    if (eventsQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (eventsQ.isError) {
      return (
        <div className="p-6">
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
    if (evs.length === 0) return <div className="p-6"><EmptyState icon={<Activity />}>{t('k8s.emptyEvents')}</EmptyState></div>

    return (
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {evs.map((ev, idx) => (
          <EntityRow
            key={`${ev.namespace}/${ev.objectName}/${ev.reason}/${idx}`}
            leading={<ListRowIcon><Activity className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
            title={<span className="panel-mono">{ev.objectKind}/{ev.objectName}</span>}
            badges={
              <>
                <Badge tone={ev.type === 'Warning' ? 'warning' : 'success'}>{ev.reason || ev.type}</Badge>
                {ev.namespace ? <Badge tone="neutral">{ev.namespace}</Badge> : null}
                {ev.count > 1 ? <Badge tone="info">x{ev.count}</Badge> : null}
              </>
            }
            subtitle={ev.message}
            actions={
              ev.lastSeen ? (
                <span className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">
                  {new Date(ev.lastSeen).toLocaleTimeString()}
                </span>
              ) : null
            }
          />
        ))}
      </div>
    )
  }

  // ConfigMaps & Secrets
  if (configsQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
  if (configsQ.isError) {
    return (
      <div className="p-6">
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
  if (cfgs.length === 0) return <div className="p-6"><EmptyState icon={<KeyRound />}>{t('k8s.emptyConfigs')}</EmptyState></div>

  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
      {cfgs.map((c) => (
        <EntityRow
          key={`${c.kind}/${c.namespace}/${c.name}`}
          centered
          leading={<ListRowIcon><KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
          title={<span className="panel-mono">{c.name}</span>}
          badges={
            <>
              <Badge tone={c.kind === 'Secret' ? 'warning' : 'info'}>{c.kind}</Badge>
              <Badge tone="neutral">{c.namespace}</Badge>
            </>
          }
          subtitle={<span className="panel-mono">{c.keys.length > 0 ? c.keys.join(', ') : t('k8s.noDataKeys')}</span>}
          actions={
            <IconButton size="sm" variant="ghost" label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: c.kind.toLowerCase(), namespace: c.namespace, name: c.name })}>
              <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          }
        />
      ))}
    </div>
  )
}
