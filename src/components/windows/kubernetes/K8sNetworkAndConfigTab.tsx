import { useState } from 'react'
import { Activity, Code2, FileCode2, Globe2, KeyRound, Network, Server } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { EmptyState } from '@/components/ui/states'
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
          <Button variant="ghost" disabled={!yamlDraft.trim() || applyYamlMut.isPending} onClick={() => setYamlDraft('')}>
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
    const svcs = (servicesQ.data?.services ?? []).filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.namespace.toLowerCase().includes(q) || s.type.toLowerCase().includes(q),
    )
    const ingresses = (servicesQ.data?.ingresses ?? []).filter(
      (ig) => !q || ig.name.toLowerCase().includes(q) || ig.hosts.some((h) => h.toLowerCase().includes(q)),
    )
    const totalEmpty = svcs.length === 0 && ingresses.length === 0

    return (
      <ListTable
        variant="k8s-services"
        empty={servicesQ.isLoading || servicesQ.isError || totalEmpty}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('k8s.col.service') },
          { label: t('k8s.col.typeNs') },
          { label: t('k8s.col.endpoint') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={servicesQ.isLoading}
          error={servicesQ.isError}
          errorTitle={t('k8s.loadError')}
          errorHint={(servicesQ.error as Error)?.message}
          loadingText={t('k8s.loadingCluster')}
          empty={totalEmpty}
          emptyIcon={<Network />}
          emptyTitle={t('k8s.emptyServices')}
        >
          {svcs.map((svc, idx) => {
            const portSummary = svc.ports
              .map((p) => (p.nodePort > 0 ? `${p.port}:${p.nodePort}/${p.protocol}` : `${p.port}/${p.protocol}`))
              .join(', ')
            return (
              <div key={`svc:${svc.namespace}/${svc.name}`} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon><Network className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name docker-app-name--mono" title={svc.name}>{svc.name}</span>
                    <span className="docker-row__meta panel-mono">{`${svc.namespace} · ${svc.clusterIp || '-'} · ${portSummary || '-'}`}</span>
                  </div>
                </div>
                <div className="docker-cell--keep">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={svc.type === 'NodePort' || svc.type === 'LoadBalancer' ? 'primary' : 'neutral'}>{svc.type}</Badge>
                    <Badge tone="neutral">{svc.namespace}</Badge>
                  </div>
                </div>
                <div className="docker-cell docker-cell--mono" title={`${svc.clusterIp || '-'} · ${portSummary || '-'}`}>
                  <span>{svc.clusterIp || '-'}</span>
                  <span className="text-[0.6875rem] text-[var(--text-secondary)]">{portSummary || '-'}</span>
                </div>
                <div className="docker-action-btns">
                  <button type="button" className="docker-act-btn" title={t('k8s.exposeTunnel')} aria-label={t('k8s.exposeTunnel')} onClick={() => openTunnelForService(svc)}>
                    <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className="docker-act-btn" title={t('k8s.viewYaml')} aria-label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'service', namespace: svc.namespace, name: svc.name })}>
                    <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
          {ingresses.map((ig, idx) => (
            <div key={`ing:${ig.namespace}/${ig.name}`} className="docker-row">
              <div className="docker-row__num">{String(svcs.length + idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon><Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name docker-app-name--mono" title={ig.name}>{ig.name}</span>
                  <span className="docker-row__meta panel-mono">{`${ig.namespace} · ${ig.hosts.join(', ') || '-'}`}</span>
                </div>
              </div>
              <div className="docker-cell--keep">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone="info">{ig.className || 'ingress'}</Badge>
                  <Badge tone="neutral">{ig.namespace}</Badge>
                </div>
              </div>
              <div className="docker-cell docker-cell--mono" title={ig.hosts.join(', ') || '-'}>{ig.hosts.join(', ') || '-'}</div>
              <div className="docker-action-btns">
                <button type="button" className="docker-act-btn" title={t('k8s.viewYaml')} aria-label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: 'ingress', namespace: ig.namespace, name: ig.name })}>
                  <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </ListState>
      </ListTable>
    )
  }

  if (section === 'events') {
    const evs = (eventsQ.data ?? []).filter(
      (e) =>
        !q ||
        e.reason.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        e.objectName.toLowerCase().includes(q) ||
        e.namespace.toLowerCase().includes(q),
    )

    return (
      <ListTable
        variant="k8s-events"
        empty={eventsQ.isLoading || eventsQ.isError || evs.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('k8s.col.event') },
          { label: t('k8s.col.reason') },
          { label: t('k8s.col.time'), actions: true },
        ]}
      >
        <ListState
          loading={eventsQ.isLoading}
          error={eventsQ.isError}
          errorTitle={t('k8s.loadError')}
          errorHint={(eventsQ.error as Error)?.message}
          loadingText={t('k8s.loadingCluster')}
          empty={evs.length === 0}
          emptyIcon={<Activity />}
          emptyTitle={t('k8s.emptyEvents')}
        >
          {evs.map((ev, idx) => (
            <div key={`${ev.namespace}/${ev.objectName}/${ev.reason}/${idx}`} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon><Activity className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                <div className="docker-row__text">
                  <div className="docker-row__title">
                    <span className="docker-app-name docker-app-name--mono" title={`${ev.objectKind}/${ev.objectName}`}>
                      {ev.objectKind}/{ev.objectName}
                    </span>
                    {ev.namespace ? <Badge tone="neutral">{ev.namespace}</Badge> : null}
                    {ev.count > 1 ? <Badge tone="info">x{ev.count}</Badge> : null}
                  </div>
                  <span className="docker-row__sub" title={ev.message}>{ev.message}</span>
                  <span className="docker-row__meta">{ev.message}</span>
                </div>
              </div>
              <div className="docker-cell--keep">
                <span className={`docker-status-pill docker-status-pill--${ev.type === 'Warning' ? 'paused' : 'running'}`}>
                  <span className="docker-status-dot" />
                  <span>{ev.reason || ev.type}</span>
                </span>
              </div>
              <div className="docker-cell docker-cell--mono items-end text-right">
                {ev.lastSeen ? new Date(ev.lastSeen).toLocaleTimeString() : '-'}
              </div>
            </div>
          ))}
        </ListState>
      </ListTable>
    )
  }

  // ConfigMaps & Secrets
  const cfgs = (configsQ.data ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.namespace.toLowerCase().includes(q) || c.kind.toLowerCase().includes(q),
  )

  return (
    <ListTable
      variant="k8s-configs"
      empty={configsQ.isLoading || configsQ.isError || cfgs.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        { label: t('k8s.col.config') },
        { label: t('k8s.col.typeNs') },
        { label: t('k8s.col.keys') },
        { label: t('docker.colActions'), actions: true },
      ]}
    >
      <ListState
        loading={configsQ.isLoading}
        error={configsQ.isError}
        errorTitle={t('k8s.loadError')}
        errorHint={(configsQ.error as Error)?.message}
        loadingText={t('k8s.loadingCluster')}
        empty={cfgs.length === 0}
        emptyIcon={<KeyRound />}
        emptyTitle={t('k8s.emptyConfigs')}
      >
        {cfgs.map((c, idx) => (
          <div key={`${c.kind}/${c.namespace}/${c.name}`} className="docker-row">
            <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
            <div className="docker-row__app">
              <ListRowIcon><KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
              <div className="docker-row__text">
                <span className="docker-app-name docker-app-name--mono" title={c.name}>{c.name}</span>
                <span className="docker-row__meta panel-mono">{c.keys.length > 0 ? c.keys.join(', ') : t('k8s.noDataKeys')}</span>
              </div>
            </div>
            <div className="docker-cell--keep">
              <div className="flex flex-wrap items-center gap-1">
                <Badge tone={c.kind === 'Secret' ? 'warning' : 'info'}>{c.kind}</Badge>
                <Badge tone="neutral">{c.namespace}</Badge>
              </div>
            </div>
            <div className="docker-cell docker-cell--mono" title={c.keys.join(', ')}>
              {c.keys.length > 0 ? c.keys.join(', ') : t('k8s.noDataKeys')}
            </div>
            <div className="docker-action-btns">
              <button type="button" className="docker-act-btn" title={t('k8s.viewYaml')} aria-label={t('k8s.viewYaml')} onClick={() => setYamlTarget({ kind: c.kind.toLowerCase(), namespace: c.namespace, name: c.name })}>
                <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ))}
      </ListState>
    </ListTable>
  )
}
