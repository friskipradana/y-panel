import { useState } from 'react'
import { Copy, Download, Layers, Server, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { KpiCard } from '@/components/ui/KpiCard'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { ErrorState, LoadingState } from '@/components/ui/states'
import type { KubernetesWindowState } from './useKubernetesWindow'

export function K8sOverviewTab({ kw }: { kw: KubernetesWindowState }) {
  const {
    t,
    statusQ,
    summaryQ,
    hasCluster,
    joinCmdQ,
    k3sLogs,
    k3sInstalling,
    startK3sInstall,
    uninstallK3sMut,
    confirmUninstallK3s,
    setAddClusterOpen,
    setSection,
  } = kw

  const [disableTraefik, setDisableTraefik] = useState(true)
  const host = statusQ.data?.host
  const isSuper = statusQ.data?.isSuper === true
  const sum = summaryQ.data

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('common.copied'))
    } catch {
      toast.error(t('common.copyFailed'))
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-4">
      {hasCluster ? (
        <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
          <SectionHeader
            icon={<Layers />}
            title={t('k8s.clusterSummary')}
            tone="primary"
            className="mb-0"
          />
          {summaryQ.isLoading ? (
            <LoadingState>{t('k8s.loadingCluster')}</LoadingState>
          ) : summaryQ.isError ? (
            <ErrorState
              title={t('k8s.clusterUnreachable')}
              hint={(summaryQ.error as Error)?.message || t('k8s.checkKubeconfigHint')}
              action={
                <Button size="sm" variant="ghost" onClick={() => void summaryQ.refetch()}>
                  {t('common.refresh')}
                </Button>
              }
            />
          ) : sum ? (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <KpiCard
                  title={t('k8s.kpi.nodes')}
                  value={`${sum.nodesReady}/${sum.nodesTotal}`}
                  subtitle={sum.serverVersion || '-'}
                />
                <KpiCard
                  title={t('k8s.kpi.pods')}
                  value={`${sum.podsRunning}/${sum.podsTotal}`}
                  subtitle={t('k8s.kpi.podsSub', { pending: sum.podsPending, failed: sum.podsFailed })}
                />
                <KpiCard
                  title={t('k8s.kpi.deployments')}
                  value={String(sum.deployments)}
                  subtitle={t('k8s.kpi.namespaces', { count: sum.namespacesTotal })}
                />
                <KpiCard
                  title={t('k8s.kpi.services')}
                  value={String(sum.services)}
                  subtitle={t('k8s.kpi.servicesSub')}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSection('pods')}>{t('k8s.tab.pods')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSection('deployments')}>{t('k8s.tab.deployments')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSection('services')}>{t('k8s.tab.services')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSection('events')}>{t('k8s.tab.events')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSection('yaml')}>{t('k8s.tab.yaml')}</Button>
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
          <SectionHeader
            icon={<Server />}
            title={t('k8s.noClusterTitle')}
            subtitle={t('k8s.noClusterHint')}
            tone="neutral"
            className="mb-0"
          />
          <div>
            <Button variant="primary" onClick={() => setAddClusterOpen(true)}>
              {t('k8s.importKubeconfig')}
            </Button>
          </div>
        </section>
      )}

      <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
        <SectionHeader
          icon={<Server />}
          title={t('k8s.hostK3sTitle')}
          subtitle={t('k8s.hostK3sDesc')}
          tone="primary"
          className="mb-0"
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={host?.kubectlInstalled ? 'success' : 'neutral'} dot>
                {host?.kubectlInstalled ? t('k8s.kubectlReady') : t('k8s.kubectlMissing')}
              </Badge>
              <Badge tone={host?.k3sRunning ? 'success' : host?.k3sInstalled ? 'warning' : 'neutral'} dot>
                {host?.k3sRunning ? t('k8s.k3sRunning') : host?.k3sInstalled ? t('k8s.k3sStopped') : t('k8s.k3sNotInstalled')}
              </Badge>
            </div>
          }
        />

        {isSuper && host?.canInstallK3s && !host.k3sInstalled ? (
          <div className="space-y-2.5">
            <Checkbox
              checked={disableTraefik}
              onChange={setDisableTraefik}
              label={t('k8s.disableTraefikLabel')}
            />
            <div>
              <Button
                variant="primary-soft"
                icon={<Download className="h-3.5 w-3.5" strokeWidth={1.75} />}
                loading={k3sInstalling}
                onClick={() => void startK3sInstall(disableTraefik)}
              >
                {t('k8s.installK3sBtn')}
              </Button>
            </div>
          </div>
        ) : null}

        {!host?.canInstallK3s ? (
          <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {t('k8s.linuxOnlyNote')}
          </p>
        ) : null}

        {k3sLogs.length > 0 ? (
          <pre className="panel-mono max-h-48 overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] whitespace-pre-wrap break-words">
            {k3sLogs.join('\n')}
          </pre>
        ) : null}

        {isSuper && host?.k3sRunning && joinCmdQ.data ? (
          <div className="space-y-1.5">
            <p className="panel-section-label">{t('k8s.joinWorkerTitle')}</p>
            <div className="flex items-center gap-2">
              <code className="panel-mono flex-1 truncate rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-2.5 py-1.5 text-[0.75rem] text-[var(--win-text)]">
                {joinCmdQ.data.command}
              </code>
              <Button
                size="sm"
                variant="outline"
                icon={<Copy className="h-3.5 w-3.5" strokeWidth={1.75} />}
                onClick={() => void copyText(joinCmdQ.data!.command)}
              >
                {t('common.copy')}
              </Button>
            </div>
          </div>
        ) : null}

        {isSuper && host?.canUninstallK3s ? (
          <div className="border-t border-[var(--win-border)] pt-2.5">
            <Button
              size="sm"
              variant="danger-soft"
              icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
              loading={uninstallK3sMut.isPending}
              onClick={() => void confirmUninstallK3s()}
            >
              {t('k8s.uninstallK3s')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
