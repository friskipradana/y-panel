import { useState } from 'react'
import { Copy, Download, Server, Trash2 } from 'lucide-react'
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
    <div className="p-3.5 space-y-4 overflow-y-auto flex-1">
      {hasCluster ? (
        <section className="space-y-2.5">
          <SectionHeader icon={<Server className="h-3.5 w-3.5" strokeWidth={1.75} />} title={t('k8s.clusterSummary')} />
          {summaryQ.isLoading ? (
            <LoadingState>{t('k8s.loadingCluster')}</LoadingState>
          ) : summaryQ.isError ? (
            <ErrorState
              title={t('k8s.clusterUnreachable')}
              hint={(summaryQ.error as Error)?.message || t('k8s.checkKubeconfigHint')}
              action={<Button size="sm" variant="ghost" onClick={() => void summaryQ.refetch()}>{t('common.refresh')}</Button>}
            />
          ) : sum ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
          ) : null}
          {sum ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setSection('pods')}>{t('k8s.tab.pods')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSection('deployments')}>{t('k8s.tab.deployments')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSection('services')}>{t('k8s.tab.services')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSection('yaml')}>{t('k8s.tab.yaml')}</Button>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="settings-card space-y-2">
          <SectionHeader icon={<Server className="h-3.5 w-3.5" strokeWidth={1.75} />} title={t('k8s.noClusterTitle')} />
          <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">{t('k8s.noClusterHint')}</p>
          <div className="pt-1">
            <Button size="sm" variant="primary" onClick={() => setAddClusterOpen(true)}>
              {t('k8s.importKubeconfig')}
            </Button>
          </div>
        </section>
      )}

      <section className="settings-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Server className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-semibold text-[var(--win-text)]">{t('k8s.hostK3sTitle')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={host?.kubectlInstalled ? 'success' : 'neutral'}>
              {host?.kubectlInstalled ? t('k8s.kubectlReady') : t('k8s.kubectlMissing')}
            </Badge>
            <Badge tone={host?.k3sRunning ? 'success' : host?.k3sInstalled ? 'warning' : 'neutral'}>
              {host?.k3sRunning ? t('k8s.k3sRunning') : host?.k3sInstalled ? t('k8s.k3sStopped') : t('k8s.k3sNotInstalled')}
            </Badge>
          </div>
        </div>

        <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">{t('k8s.hostK3sDesc')}</p>

        {isSuper && host?.canInstallK3s && !host.k3sInstalled ? (
          <div className="space-y-2.5 pt-1">
            <Checkbox
              checked={disableTraefik}
              onChange={setDisableTraefik}
              label={t('k8s.disableTraefikLabel')}
            />
            <div>
              <Button
                size="sm"
                variant="primary-soft"
                loading={k3sInstalling}
                onClick={() => void startK3sInstall(disableTraefik)}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('k8s.installK3sBtn')}</span>
              </Button>
            </div>
          </div>
        ) : null}

        {!host?.canInstallK3s ? (
          <p className="text-[12px] text-[var(--text-secondary)]">{t('k8s.linuxOnlyNote')}</p>
        ) : null}

        {k3sLogs.length > 0 ? (
          <pre className="panel-mono max-h-44 overflow-y-auto rounded-md border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-2.5 text-[11.5px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
            {k3sLogs.join('\n')}
          </pre>
        ) : null}

        {isSuper && host?.k3sRunning && joinCmdQ.data ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-[12px] font-medium text-[var(--win-text)]">{t('k8s.joinWorkerTitle')}</p>
            <div className="flex items-center gap-2">
              <code className="panel-mono flex-1 truncate rounded border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] px-2.5 py-1.5 text-[11.5px] text-[var(--win-text)]">
                {joinCmdQ.data.command}
              </code>
              <Button size="sm" variant="ghost" onClick={() => void copyText(joinCmdQ.data!.command)}>
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('common.copy')}</span>
              </Button>
            </div>
          </div>
        ) : null}

        {isSuper && host?.canUninstallK3s ? (
          <div className="pt-1 border-t border-[var(--win-border)]">
            <Button
              size="sm"
              variant="danger"
              loading={uninstallK3sMut.isPending}
              onClick={() => void confirmUninstallK3s()}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('k8s.uninstallK3s')}</span>
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
