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
import { EntityRow } from '@/components/ui/EntityRow'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { KpiCard } from '@/components/ui/KpiCard'
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
      <div className="p-6 flex-1">
        <EmptyState>{t('k8s.noClusterTitle')}</EmptyState>
      </div>
    )
  }

  const q = search.trim().toLowerCase()

  if (section === 'storage') {
    if (storageQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
    if (storageQ.isError) {
      return (
        <div className="p-6">
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-4">
        <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
          <SectionHeader icon={<HardDrive />} title={t('k8s.pvcsTitle')} tone="primary" className="mb-0" />
          {pvcs.length === 0 ? (
            <EmptyState icon={<HardDrive />}>{t('k8s.emptyPvcs')}</EmptyState>
          ) : (
            <div className="space-y-1.5">
              {pvcs.map((p) => (
                <EntityRow
                  key={`${p.namespace}/${p.name}`}
                  centered
                  leading={<ListRowIcon><HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
                  title={<span className="panel-mono">{p.name}</span>}
                  badges={
                    <>
                      <Badge tone={p.status === 'Bound' ? 'success' : 'warning'} dot>{p.status}</Badge>
                      <Badge tone="neutral">{p.namespace}</Badge>
                    </>
                  }
                  subtitle={<span className="panel-mono">{p.capacity || '-'} · {p.storageClass || '-'} · {p.volume || '-'}</span>}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
          <SectionHeader icon={<Clock />} title={t('k8s.cronJobsTitle')} tone="info" className="mb-0" />
          {cjs.length === 0 ? (
            <EmptyState icon={<Clock />}>{t('k8s.emptyCronJobs')}</EmptyState>
          ) : (
            <div className="space-y-1.5">
              {cjs.map((cj) => (
                <EntityRow
                  key={`${cj.namespace}/${cj.name}`}
                  centered
                  leading={<ListRowIcon><Clock className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
                  title={<span className="panel-mono">{cj.name}</span>}
                  badges={
                    <>
                      <Badge tone="primary">{cj.schedule}</Badge>
                      <Badge tone="neutral">{cj.namespace}</Badge>
                    </>
                  }
                  subtitle={
                    <span className="panel-mono">
                      {t('k8s.cronMeta', { active: cj.active, last: cj.lastSchedule || '-' })}
                    </span>
                  }
                  actions={
                    <Button
                      size="sm"
                      variant="primary-soft"
                      icon={<Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
                      loading={triggerCJMut.isPending}
                      onClick={() => triggerCJMut.mutate({ ns: cj.namespace, name: cj.name })}
                    >
                      {t('k8s.runNow')}
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
          <SectionHeader icon={<Cpu />} title={t('k8s.metricsTitle')} tone="neutral" className="mb-0" />
          {!d?.metricsAvailable ? (
            <p className="panel-muted-block px-3 py-2 text-[0.75rem] text-[var(--text-secondary)]">
              {t('k8s.metricsUnavailable')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {d.nodeMetrics.map((m) => (
                <KpiCard key={m.name} title={m.name} value={m.cpu} subtitle={m.memory} />
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  // Helm Manager
  if (helmQ.isLoading) return <div className="p-6"><LoadingState>{t('k8s.loadingCluster')}</LoadingState></div>
  if (helmQ.isError) {
    return (
      <div className="p-6">
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
      <div className="p-6 flex-1">
        <EmptyState icon={<Package />}>{t('k8s.helmNotInstalled')}</EmptyState>
      </div>
    )
  }

  const releases = (helm.releases ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.chart.toLowerCase().includes(q) || r.namespace.toLowerCase().includes(q),
  )

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {HELM_PRESETS.map((p) => (
            <Button
              key={p.name}
              size="sm"
              variant="outline"
              icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
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
              {p.name}
            </Button>
          ))}
        </div>
        <Button
          variant="primary-soft"
          icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
          onClick={() => setHelmOpen(true)}
        >
          {t('k8s.helmInstallBtn')}
        </Button>
      </div>

      {releases.length === 0 ? (
        <EmptyState icon={<Package />}>{t('k8s.emptyHelm')}</EmptyState>
      ) : (
        <div className="space-y-1.5">
          {releases.map((rel) => (
            <EntityRow
              key={`${rel.namespace}/${rel.name}`}
              centered
              leading={<ListRowIcon><Package className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
              title={<span className="panel-mono">{rel.name}</span>}
              badges={
                <>
                  <Badge tone={rel.status === 'deployed' ? 'success' : 'warning'} dot>{rel.status}</Badge>
                  <Badge tone="neutral">{rel.namespace}</Badge>
                  <Badge tone="info">{t('k8s.helmRevision', { rev: rel.revision })}</Badge>
                </>
              }
              subtitle={<span className="panel-mono">{rel.chart}{rel.app_version ? ` (${rel.app_version})` : ''}</span>}
              actions={
                <>
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
                    tone="danger"
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
                </>
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={helmOpen}
        onClose={() => setHelmOpen(false)}
        title={t('k8s.helmInstallTitle')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHelmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!release.trim() || !chart.trim()}
              loading={installHelmMut.isPending}
              onClick={() => installHelmMut.mutate()}
            >
              {t('k8s.helmInstallBtn')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('k8s.helmReleaseLabel')}>
              <TextInput mono value={release} onChange={(e) => setRelease(e.target.value)} />
            </Field>
            <Field label={t('k8s.namespaceLabel')}>
              <TextInput mono value={helmNs} onChange={(e) => setHelmNs(e.target.value)} />
            </Field>
          </div>
          <Field label={t('k8s.helmChartLabel')}>
            <TextInput mono value={chart} onChange={(e) => setChart(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('k8s.helmRepoNameLabel')}>
              <TextInput mono value={repoName} onChange={(e) => setRepoName(e.target.value)} />
            </Field>
            <Field label={t('k8s.helmRepoUrlLabel')}>
              <TextInput mono value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
            </Field>
          </div>
          <Field label={t('k8s.helmValuesLabel')}>
            <Textarea mono rows={7} value={valuesYaml} onChange={(e) => setValuesYaml(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
