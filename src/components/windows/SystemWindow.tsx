import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, Cpu, HardDriveDownload, MemoryStick, Network, RefreshCw, ShieldAlert, TimerReset } from 'lucide-react'
import { getSystemSummary } from '@/api/agent'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ErrorState, LoadingState } from '@/components/ui/states'

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge tone={ok ? 'success' : 'danger'}>
      {ok ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />}
      {label}
    </Badge>
  )
}

function formatBytes(value: number) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let current = value
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024
    index += 1
  }
  return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}h ${hours}j ${minutes}m`
  if (hours > 0) return `${hours}j ${minutes}m`
  return `${minutes}m`
}

function MetricCard({ icon, title, value, subtitle, percent }: {
  icon: React.ReactNode
  title: string
  value: string
  subtitle: string
  percent?: number
}) {
  return (
    <article className="panel-kpi-card">
      <div className="panel-kpi-card__header">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-[12px] font-semibold">{title}</span>
        </div>
        {percent !== undefined ? <span className="text-[12px] font-bold text-[var(--panel-primary-text)]">{percent.toFixed(1)}%</span> : null}
      </div>
      <div className="panel-kpi-card__value">{value}</div>
      <p className="panel-kpi-card__description">{subtitle}</p>
      {percent !== undefined ? (
        <div className="panel-progress">
          <div className="panel-progress__bar" style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      ) : null}
    </article>
  )
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <article className="panel-shell-card">
      <div className="mb-2.5 flex items-center gap-2 text-[var(--text-secondary)]">
        {icon}
        <span className="text-[13px] font-semibold text-[var(--win-text)]">{title}</span>
      </div>
      {children}
    </article>
  )
}

export function SystemWindow({ authenticated }: { authenticated?: boolean }) {
  const { t } = useI18n()
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['agent-system-summary'],
    queryFn: getSystemSummary,
    retry: 1,
    refetchInterval: 5_000,
  })

  useEffect(() => {
    if (authenticated) void refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  if (isLoading) {
    return (
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Cpu className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">{t('system.overviewTitle')}</div>
              <div className="panel-window__meta">{t('system.overviewMeta')}</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <LoadingState>{t('system.loadingRuntime')}</LoadingState>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Cpu className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">{t('system.overviewTitle')}</div>
              <div className="panel-window__meta">{t('system.overviewMeta')}</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <ErrorState
            title={t('system.summaryLoadFailed')}
            hint={t('system.summaryLoadFailedHint')}
            action={
              <Button variant="ghost" loading={isFetching} onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  if (data.scoped && data.account) {
    const a = data.account
    const memPct = a.memLimit ? (a.memUsed / a.memLimit) * 100 : 0
    const diskPct = a.diskLimit ? (a.diskUsed / a.diskLimit) * 100 : 0
    const unlimited = t('system.account.unlimited')
    return (
      <div className="panel-window">
        <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
          <div className="text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--win-text)]">{data.hostname}</span> · {t('system.account.scope')}
          </div>
          <IconButton type="button" onClick={() => void refetch()} label={t('system.refreshSummary')}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>
        <div className="panel-window__body">
          <div className="panel-window__stack">
            <div className="panel-kpi-grid panel-kpi-grid--4">
              <MetricCard icon={<Cpu size={15} />} title={t('system.cpuUsage')} value={a.cpuLimitPct ? `${a.cpuPercent.toFixed(1)}%` : `${a.cpuCores.toFixed(2)} core`} subtitle={a.cpuLimitPct ? t('system.account.cpuOf', { cores: (a.cpuLimitPct / 100).toFixed(2) }) : unlimited} percent={a.cpuLimitPct ? a.cpuPercent : undefined} />
              <MetricCard icon={<MemoryStick size={15} />} title={t('system.memoryRam')} value={a.memLimit ? `${formatBytes(a.memUsed)} / ${formatBytes(a.memLimit)}` : formatBytes(a.memUsed)} subtitle={a.memLimit ? t('system.account.ofQuota') : unlimited} percent={a.memLimit ? memPct : undefined} />
              <MetricCard icon={<HardDriveDownload size={15} />} title={t('system.storage')} value={a.diskLimit ? `${formatBytes(a.diskUsed)} / ${formatBytes(a.diskLimit)}` : formatBytes(a.diskUsed)} subtitle={a.diskLimit ? t('system.account.ofQuota') : unlimited} percent={a.diskLimit ? diskPct : undefined} />
              <MetricCard icon={<Activity size={15} />} title={t('system.projectsTotal')} value={`${data.projects?.total ?? 0}`} subtitle={t('system.projectsActiveCount', { count: data.projects?.active ?? 0 })} />
            </div>
            <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('system.account.note')}</p>
          </div>
        </div>
      </div>
    )
  }

  const memoryPercent = data.memory.total ? (data.memory.used / data.memory.total) * 100 : 0
  const storagePercent = data.storage.total ? (data.storage.used / data.storage.total) * 100 : 0

  return (
    <div className="panel-window">
      {/* ── Compact Toolbar ── */}
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--win-text)]">{data.osName}</span>
          <span>•</span>
          <span>{data.hostname}</span>
          <span>•</span>
          <span className="text-[var(--panel-primary-text)] font-medium">Uptime {formatUptime(data.uptimeSeconds)}</span>
        </div>

        <div className="flex items-center gap-2">
          <IconButton type="button" onClick={() => void refetch()} label={t('system.refreshSummary')}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">{t('system.hostRuntime')}</div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="panel-hero__title">{data.osName}</div>
                <p className="panel-hero__description">{data.hostname} · kernel {data.kernel}</p>
              </div>
              <div className="panel-muted-block min-w-[140px] px-4 py-3">
                <div className="panel-section-label">{t('system.uptime')}</div>
                <p className="text-[15px] font-bold text-[var(--win-text)]">{formatUptime(data.uptimeSeconds)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <HealthPill ok={data.dockerInstalled} label={data.dockerInstalled ? t('system.dockerInstalled') : t('system.dockerMissing')} />
              <HealthPill ok={data.dockerReachable} label={data.dockerReachable ? t('system.dockerReachable') : t('system.dockerUnreachable')} />
              <HealthPill ok={data.portainerReachable} label={data.portainerReachable ? t('system.portainerOnline') : t('system.portainerOffline')} />
            </div>
          </section>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <MetricCard icon={<Cpu size={15} />} title={t('system.cpuUsage')} value={`${data.cpuUsagePercent.toFixed(1)}%`} subtitle={t('system.cpuUsageSubtitle')} percent={data.cpuUsagePercent} />
            <MetricCard icon={<TimerReset size={15} />} title={t('system.systemUptime')} value={formatUptime(data.uptimeSeconds)} subtitle={t('system.systemUptimeSubtitle')} />
            <MetricCard icon={<MemoryStick size={15} />} title={t('system.memoryRam')} value={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`} subtitle={t('system.memoryRamSubtitle')} percent={memoryPercent} />
            <MetricCard icon={<HardDriveDownload size={15} />} title={t('system.storage')} value={`${formatBytes(data.storage.used)} / ${formatBytes(data.storage.total)}`} subtitle={t('system.storageSubtitleShort')} percent={storagePercent} />
          </div>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <MetricCard icon={<Activity size={15} />} title={t('system.projectsTotal')} value={`${data.projects?.total ?? 0}`} subtitle={t('system.projectsTotalSubtitle')} />
            <MetricCard icon={<CheckCircle2 size={15} />} title={t('system.projectsActive')} value={`${data.projects?.active ?? 0}`} subtitle={t('system.projectsActiveSubtitle')} />
            <MetricCard icon={<ShieldAlert size={15} />} title={t('system.needAttention')} value={`${data.projects?.attention ?? 0}`} subtitle={t('system.needAttentionSubtitle')} percent={data.projects?.total ? ((data.projects.attention / data.projects.total) * 100) : 0} />
            <MetricCard icon={<AlertTriangle size={15} />} title={t('system.runtimeDrift')} value={`${data.projects?.drift ?? 0}`} subtitle={(data.projects?.reconcileFresh ?? false) ? t('system.reconcileFresh') : t('system.reconcileStale')} />
          </div>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <InfoCard icon={<Activity size={15} />} title={t('system.dockerStatus')}>
              <p className="panel-shell-card__title">{data.dockerStatus}</p>
              <p className="panel-shell-card__meta">{t('system.dockerStatusMeta')}</p>
            </InfoCard>

            <InfoCard icon={<ShieldAlert size={15} />} title={t('system.orchestratorHealth')}>
              <p className="panel-shell-card__title">
                {data.projects?.attention > 0 ? t('system.workloadsNeedAttention', { count: data.projects.attention }) : t('system.workloadsStable')}
              </p>
              <p className="panel-shell-card__meta">
                {t('system.orchestratorCounts', { degraded: data.projects?.degraded ?? 0, drift: data.projects?.drift ?? 0, freshness: data.projects?.reconcileFresh ? t('system.fresh') : t('system.pending') })}
              </p>
            </InfoCard>

            <InfoCard icon={<Network size={15} />} title={t('system.ipAddress')}>
              {data.ipAddresses && data.ipAddresses.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.ipAddresses.map((ip) => (
                    <code key={ip} className="panel-muted-block panel-mono block break-all px-3 py-2 text-[12px] text-[var(--win-text)]">{ip}</code>
                  ))}
                </div>
              ) : (
                <p className="panel-shell-card__meta">{t('system.noActiveInterfaces')}</p>
              )}
            </InfoCard>
          </div>

        </div>
      </div>
    </div>
  )
}




