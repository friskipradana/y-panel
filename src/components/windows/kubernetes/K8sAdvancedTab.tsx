import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Cpu, HardDrive, LoaderCircle, Package, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
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
import { KpiCard } from '@/components/ui/KpiCard'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
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
        release: release.trim(), chart: chart.trim(),
        repoName: repoName.trim() || undefined, repoUrl: repoUrl.trim() || undefined,
        namespace: helmNs.trim() || 'default', valuesYaml: valuesYaml.trim() || undefined,
      }),
    onSuccess: () => { toast.success(t('k8s.helmInstalled')); setHelmOpen(false); void qc.invalidateQueries({ queryKey: ['k8s-helm', activeClusterId] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  const rollbackHelmMut = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => rollbackK8sHelmRelease(activeClusterId, ns, name),
    onSuccess: () => { toast.success(t('k8s.helmRolledBack')); void qc.invalidateQueries({ queryKey: ['k8s-helm', activeClusterId] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  const uninstallHelmMut = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => uninstallK8sHelmRelease(activeClusterId, ns, name),
    onSuccess: () => { toast.success(t('k8s.helmUninstalled')); void qc.invalidateQueries({ queryKey: ['k8s-helm', activeClusterId] }) },
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
          <div className="widgets-section overflow-hidden rounded-lg border border-[var(--win-border)]">
            <ListTable
              variant="k8s-pvcs"
              empty={pvcs.length === 0}
              columns={[
                { label: t('docker.colIndex') },
                { label: t('k8s.col.volume') },
                { label: t('docker.colStatus') },
                { label: t('k8s.col.storageClass') },
                { label: t('k8s.col.namespace') },
              ]}
            >
              <ListState loading={false} error={false} errorTitle="" loadingText="" empty={pvcs.length === 0} emptyIcon={<HardDrive />} emptyTitle={t('k8s.emptyPvcs')}>
                {pvcs.map((p, idx) => (
                  <div key={`${p.namespace}/${p.name}`} className="docker-row">
                    <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                    <div className="docker-row__app">
                      <ListRowIcon><HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                      <div className="docker-row__text">
                        <span className="docker-app-name docker-app-name--mono" title={p.name}>{p.name}</span>
                        <span className="docker-row__sub panel-mono">{p.volume || '-'}</span>
                        <span className="docker-row__meta panel-mono">{`${p.namespace} · ${p.capacity || '-'} · ${p.storageClass || '-'}`}</span>
                      </div>
                    </div>
                    <div className="docker-cell--keep">
                      <span className={`docker-status-pill docker-status-pill--${p.status === 'Bound' ? 'running' : 'paused'}`}>
                        <span className="docker-status-dot" />
                        <span>{p.status}</span>
                      </span>
                    </div>
                    <div className="docker-cell docker-cell--mono">{`${p.capacity || '-'} · ${p.storageClass || '-'}`}</div>
                    <div className="docker-cell docker-cell--mono">{p.namespace}</div>
                  </div>
                ))}
              </ListState>
            </ListTable>
          </div>
        </section>

        <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
          <SectionHeader icon={<Clock />} title={t('k8s.cronJobsTitle')} tone="info" className="mb-0" />
          <div className="widgets-section overflow-hidden rounded-lg border border-[var(--win-border)]">
            <ListTable
              variant="k8s-cronjobs"
              empty={cjs.length === 0}
              columns={[
                { label: t('docker.colIndex') },
                { label: t('k8s.col.cronJob') },
                { label: t('services.col.schedule') },
                { label: t('k8s.col.lastRun') },
                { label: t('docker.colActions'), actions: true },
              ]}
            >
              <ListState loading={false} error={false} errorTitle="" loadingText="" empty={cjs.length === 0} emptyIcon={<Clock />} emptyTitle={t('k8s.emptyCronJobs')}>
                {cjs.map((cj, idx) => (
                  <div key={`${cj.namespace}/${cj.name}`} className="docker-row">
                    <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                    <div className="docker-row__app">
                      <ListRowIcon><Clock className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                      <div className="docker-row__text">
                        <div className="docker-row__title">
                          <span className="docker-app-name docker-app-name--mono" title={cj.name}>{cj.name}</span>
                          <Badge tone="neutral">{cj.namespace}</Badge>
                        </div>
                        <span className="docker-row__meta panel-mono">{`${cj.schedule} · ${cj.lastSchedule || '-'}`}</span>
                      </div>
                    </div>
                    <div className="docker-cell docker-cell--mono">{cj.schedule}</div>
                    <div className="docker-cell docker-cell--mono">{cj.lastSchedule || '-'}</div>
                    <div className="docker-action-btns">
                      <button
                        type="button"
                        className="docker-act-btn docker-act-btn--start"
                        title={t('k8s.runNow')}
                        aria-label={t('k8s.runNow')}
                        disabled={triggerCJMut.isPending}
                        onClick={() => triggerCJMut.mutate({ ns: cj.namespace, name: cj.name })}
                      >
                        {triggerCJMut.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
                      </button>
                    </div>
                  </div>
                ))}
              </ListState>
            </ListTable>
          </div>
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
  const helm = helmQ.data
  const releases = (helm?.releases ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.chart.toLowerCase().includes(q) || r.namespace.toLowerCase().includes(q),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {helm?.installed ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {HELM_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="docker-secondary-btn"
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
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <button type="button" className="docker-primary-btn" onClick={() => setHelmOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('k8s.helmInstallBtn')}</span>
          </button>
        </div>
      ) : null}

      <ListTable
        variant="k8s-helm"
        empty={helmQ.isLoading || helmQ.isError || !helm?.installed || releases.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('k8s.col.release') },
          { label: t('k8s.col.chart') },
          { label: t('docker.colStatus') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={helmQ.isLoading}
          error={helmQ.isError}
          errorTitle={t('k8s.loadError')}
          errorHint={(helmQ.error as Error)?.message}
          loadingText={t('k8s.loadingCluster')}
          empty={!helm?.installed || releases.length === 0}
          emptyIcon={<Package />}
          emptyTitle={!helm?.installed ? t('k8s.helmNotInstalled') : t('k8s.emptyHelm')}
        >
          {releases.map((rel, idx) => (
            <div key={`${rel.namespace}/${rel.name}`} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon><Package className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                <div className="docker-row__text">
                  <div className="docker-row__title">
                    <span className="docker-app-name docker-app-name--mono" title={rel.name}>{rel.name}</span>
                    <Badge tone="neutral">{rel.namespace}</Badge>
                    <Badge tone="info">{t('k8s.helmRevision', { rev: rel.revision })}</Badge>
                  </div>
                  <span className="docker-row__meta panel-mono">{`${rel.chart}${rel.app_version ? ` (${rel.app_version})` : ''}`}</span>
                </div>
              </div>
              <div className="docker-cell docker-cell--mono" title={rel.chart}>
                <span>{rel.chart}</span>
                {rel.app_version ? <span className="text-[0.6875rem] text-[var(--text-secondary)]">{rel.app_version}</span> : null}
              </div>
              <div className="docker-cell--keep">
                <span className={`docker-status-pill docker-status-pill--${rel.status === 'deployed' ? 'running' : 'paused'}`}>
                  <span className="docker-status-dot" />
                  <span>{rel.status}</span>
                </span>
              </div>
              <div className="docker-action-btns">
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--restart"
                  title={t('k8s.helmRollback')}
                  aria-label={t('k8s.helmRollback')}
                  onClick={() => rollbackHelmMut.mutate({ ns: rel.namespace, name: rel.name })}
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--danger"
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
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
                </button>
              </div>
            </div>
          ))}
        </ListState>
      </ListTable>

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
