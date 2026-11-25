import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Cpu, HardDrive, Package, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getK8sHelmOverview,
  getK8sStorageBatch,
  installK8sHelmChart,
  rollbackK8sHelmRelease,
  triggerK8sCronJob,
  uninstallK8sHelmRelease,
} from '@/api/k8s'
import { alertLib } from '@/lib/alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { Modal } from '@/components/ui/Modal'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import type { KubernetesWindowState } from './useKubernetesWindow'

const HELM_PRESETS = [
  { name: 'redis', chart: 'bitnami/redis', repoName: 'bitnami', repoUrl: 'https://charts.bitnami.com/bitnami', namespace: 'default' },
  { name: 'minio', chart: 'bitnami/minio', repoName: 'bitnami', repoUrl: 'https://charts.bitnami.com/bitnami', namespace: 'storage' },
  { name: 'cert-manager', chart: 'jetstack/cert-manager', repoName: 'jetstack', repoUrl: 'https://charts.jetstack.io', namespace: 'cert-manager' },
  { name: 'prometheus', chart: 'prometheus-community/kube-prometheus-stack', repoName: 'prometheus-community', repoUrl: 'https://prometheus-community.github.io/helm-charts', namespace: 'monitoring' },
]

export function K8sAdvancedTab({ kw }: { kw: KubernetesWindowState }) {
  const { t, section, activeClusterId, hasCluster, namespace, search } = kw
  const qc = useQueryClient()
  const [helmOpen, setHelmOpen] = useState(false)
  const [release, setRelease] = useState('')
  const [chart, setChart] = useState('')
  const [repoName, setRepoName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [helmNs, setHelmNs] = useState('default')
  const [valuesYaml, setValuesYaml] = useState('')

  const storageQ = useQuery({
    queryKey: ['k8s-storage-batch', activeClusterId, namespace],
    queryFn: () => getK8sStorageBatch(activeClusterId, namespace),
    enabled: hasCluster && section === 'storage',
  })

  const helmQ = useQuery({
    queryKey: ['k8s-helm', activeClusterId],
    queryFn: () => getK8sHelmOverview(activeClusterId),
    enabled: hasCluster && section === 'helm',
  })

  const triggerCJMut = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => triggerK8sCronJob(activeClusterId, ns, name),
    onSuccess: (res) => {
      toast.success(res.output || t('k8s.cronTriggered'))
      void qc.invalidateQueries({ queryKey: ['k8s-storage-batch', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const installHelmMut = useMutation({
    mutationFn: () =>
      installK8sHelmChart(activeClusterId, {
        release: release.trim(),
        chart: chart.trim(),
        repoName: repoName.trim() || undefined,
        repoUrl: repoUrl.trim() || undefined,
        namespace: helmNs.trim() || 'default',
        valuesYaml: valuesYaml.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t('k8s.helmInstalled'))
      setHelmOpen(false)
      void qc.invalidateQueries({ queryKey: ['k8s-helm', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rollbackHelmMut = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => rollbackK8sHelmRelease(activeClusterId, ns, name),
    onSuccess: () => {
      toast.success(t('k8s.helmRolledBack'))
      void qc.invalidateQueries({ queryKey: ['k8s-helm', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const uninstallHelmMut = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => uninstallK8sHelmRelease(activeClusterId, ns, name),
    onSuccess: () => {
      toast.success(t('k8s.helmUninstalled'))
      void qc.invalidateQueries({ queryKey: ['k8s-helm', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!hasCluster) {
    return (
      <div className="p-4 flex-1">
        <EmptyState>{t('k8s.noClusterTitle')}</EmptyState>
      </div>
    )
  }

  const q = search.trim().toLowerCase()

  if (section === 'storage') {
    if (storageQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (storageQ.isError) {
      return (
        <div className="p-4">
          <ErrorState
            title={t('k8s.loadError')}
            hint={(storageQ.error as Error)?.message}
            action={<Button size="sm" variant="ghost" onClick={() => void storageQ.refetch()}>{t('common.refresh')}</Button>}
          />
        </div>
      )
    }
    const d = storageQ.data
    const pvcs = (d?.pvcs ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q))
    const cjs = (d?.cronJobs ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.namespace.toLowerCase().includes(q))

    return (
      <div className="p-3.5 space-y-4 overflow-y-auto flex-1">
        <section className="space-y-2">
          <SectionHeader icon={<HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />} title={t('k8s.pvcsTitle')} />
          {pvcs.length === 0 ? (
            <EmptyState icon={<HardDrive />}>{t('k8s.emptyPvcs')}</EmptyState>
          ) : (
            <div className="space-y-1.5">
              {pvcs.map((p) => (
                <div key={`${p.namespace}/${p.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)]">{p.name}</span>
                      <Badge tone={p.status === 'Bound' ? 'success' : 'warning'}>{p.status}</Badge>
                      <Badge tone="neutral">{p.namespace}</Badge>
                    </div>
                    <p className="panel-mono text-[11.5px] text-[var(--text-secondary)]">
                      {p.capacity || '-'} · {p.storageClass || 'default'} · {p.volume || '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <SectionHeader icon={<Clock className="h-3.5 w-3.5" strokeWidth={1.75} />} title={t('k8s.cronJobsTitle')} />
          {cjs.length === 0 ? (
            <EmptyState icon={<Clock />}>{t('k8s.emptyCronJobs')}</EmptyState>
          ) : (
            <div className="space-y-1.5">
              {cjs.map((cj) => (
                <div key={`${cj.namespace}/${cj.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)]">{cj.name}</span>
                      <Badge tone="primary">{cj.schedule}</Badge>
                      <Badge tone="neutral">{cj.namespace}</Badge>
                    </div>
                    <p className="panel-mono text-[11.5px] text-[var(--text-secondary)]">
                      Active: {cj.active} · Last: {cj.lastSchedule || '-'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="primary-soft"
                    loading={triggerCJMut.isPending}
                    onClick={() => triggerCJMut.mutate({ ns: cj.namespace, name: cj.name })}
                  >
                    <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>{t('k8s.runNow')}</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <SectionHeader icon={<Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />} title={t('k8s.metricsTitle')} />
          {!d?.metricsAvailable ? (
            <p className="text-[12px] text-[var(--text-secondary)]">{t('k8s.metricsUnavailable')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {d.nodeMetrics.map((m) => (
                <div key={m.name} className="rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
                  <div className="panel-mono text-[12.5px] font-semibold text-[var(--win-text)]">{m.name}</div>
                  <div className="panel-mono text-[11.5px] text-[var(--text-secondary)]">CPU {m.cpu} · RAM {m.memory}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  // Helm Manager
  if (helmQ.isLoading) return <div className="p-4"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
  if (helmQ.isError) {
    return (
      <div className="p-4">
        <ErrorState
          title={t('k8s.loadError')}
          hint={(helmQ.error as Error)?.message}
          action={<Button size="sm" variant="ghost" onClick={() => void helmQ.refetch()}>{t('common.refresh')}</Button>}
        />
      </div>
    )
  }

  const helm = helmQ.data
  if (!helm?.installed) {
    return (
      <div className="p-4 flex-1">
        <EmptyState icon={<Package />}>{t('k8s.helmNotInstalled')}</EmptyState>
      </div>
    )
  }

  const releases = (helm.releases ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.chart.toLowerCase().includes(q) || r.namespace.toLowerCase().includes(q))

  return (
    <div className="p-3.5 space-y-3 overflow-y-auto flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {HELM_PRESETS.map((p) => (
            <Button
              key={p.name}
              size="sm"
              variant="ghost"
              onClick={() => {
                setRelease(p.name)
                setChart(p.chart)
                setRepoName(p.repoName)
                setRepoUrl(p.repoUrl)
                setHelmNs(p.namespace)
                setValuesYaml('')
                setHelmOpen(true)
              }}
            >
              <Plus className="h-3 w-3" strokeWidth={1.75} />
              <span>{p.name}</span>
            </Button>
          ))}
        </div>
        <Button size="sm" variant="primary" onClick={() => setHelmOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>{t('k8s.helmInstallBtn')}</span>
        </Button>
      </div>

      {releases.length === 0 ? (
        <EmptyState icon={<Package />}>{t('k8s.emptyHelm')}</EmptyState>
      ) : (
        <div className="space-y-1.5">
          {releases.map((rel) => (
            <div key={`${rel.namespace}/${rel.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ListRowIcon><Package className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)]">{rel.name}</span>
                    <Badge tone={rel.status === 'deployed' ? 'success' : 'warning'}>{rel.status}</Badge>
                    <Badge tone="neutral">{rel.namespace}</Badge>
                    <Badge tone="info">rev {rel.revision}</Badge>
                  </div>
                  <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                    {rel.chart} {rel.app_version ? `(${rel.app_version})` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={t('k8s.helmRollback')}
                  onClick={() => rollbackHelmMut.mutate({ ns: rel.namespace, name: rel.name })}
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={t('common.delete')}
                  onClick={async () => {
                    const ok = await alertLib.confirm(
                      t('k8s.helmUninstallTitle'),
                      t('k8s.helmUninstallConfirm', { name: `${rel.namespace}/${rel.name}` }),
                      t('common.delete'),
                      t('common.cancel'),
                      'warning',
                      'kubernetes',
                    )
                    if (ok) uninstallHelmMut.mutate({ ns: rel.namespace, name: rel.name })
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={helmOpen} onClose={() => setHelmOpen(false)} title={t('k8s.helmInstallTitle')} size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('k8s.helmReleaseLabel')}>
              <TextInput className="panel-input--mono" value={release} onChange={(e) => setRelease(e.target.value)} />
            </Field>
            <Field label={t('k8s.namespaceLabel')}>
              <TextInput className="panel-input--mono" value={helmNs} onChange={(e) => setHelmNs(e.target.value)} />
            </Field>
          </div>
          <Field label={t('k8s.helmChartLabel')}>
            <TextInput className="panel-input--mono" value={chart} onChange={(e) => setChart(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('k8s.helmRepoNameLabel')}>
              <TextInput className="panel-input--mono" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
            </Field>
            <Field label={t('k8s.helmRepoUrlLabel')}>
              <TextInput className="panel-input--mono" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
            </Field>
          </div>
          <Field label={t('k8s.helmValuesLabel')}>
            <Textarea rows={7} className="panel-input--mono" value={valuesYaml} onChange={(e) => setValuesYaml(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setHelmOpen(false)}>{t('common.cancel')}</Button>
            <Button size="sm" variant="primary" disabled={!release.trim() || !chart.trim()} loading={installHelmMut.isPending} onClick={() => installHelmMut.mutate()}>
              {t('k8s.helmInstallBtn')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
