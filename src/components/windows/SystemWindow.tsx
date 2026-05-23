import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, Cpu, Database, HardDriveDownload, MemoryStick, Network, RefreshCw, ServerCrash, ShieldAlert, TimerReset } from 'lucide-react'
import { getDatabaseStatus, getSystemSummary } from '@/api/agent'
import { useWindowStore } from '@/store/windowStore'
import { useI18n } from '@/lib/i18n'
import type { RuntimeDatabaseLog } from '@/types'

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`panel-badge ${ok ? 'panel-badge--success' : 'panel-badge--danger'}`}>
      {ok ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />}
      {label}
    </div>
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

function extractProjectId(metadata: string) {
  if (!metadata || metadata === '{}') return null
  try {
    const parsed = JSON.parse(metadata) as { projectId?: number; projectID?: number }
    const raw = parsed.projectId ?? parsed.projectID
    const nextId = Number(raw ?? 0)
    return Number.isFinite(nextId) && nextId > 0 ? nextId : null
  } catch {
    const match = metadata.match(/"project(?:Id|ID)"\s*:\s*(\d+)/)
    if (!match) return null
    const nextId = Number(match[1])
    return Number.isFinite(nextId) && nextId > 0 ? nextId : null
  }
}

function extractAttentionType(message: string, metadata: string) {
  const haystack = `${message} ${metadata}`.toLowerCase()
  if (haystack.includes('drift')) return 'drift'
  if (haystack.includes('degraded') || haystack.includes('project status reconciled')) return 'degraded'
  return 'all'
}

export function SystemWindow({ authenticated }: { authenticated?: boolean }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['agent-system-summary'],
    queryFn: getSystemSummary,
    retry: 1,
    refetchInterval: 5_000,
  })
  const databaseQuery = useQuery({
    queryKey: ['database-status'],
    queryFn: getDatabaseStatus,
    retry: 1,
    refetchInterval: 15_000,
  })
  const openWindow = useWindowStore((state) => state.openWindow)
  const { t } = useI18n()

  useEffect(() => {
    if (authenticated) {
      void refetch()
      void databaseQuery.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const reconcileIncidents = useMemo(() => {
    const runtimeLogs = databaseQuery.data?.runtimeLogs ?? []
    return runtimeLogs
      .filter((entry) => {
        const message = entry.message.toLowerCase()
        return message.includes('reconcile') || message.includes('drift') || message.includes('degraded')
      })
      .slice(0, 5)
  }, [databaseQuery.data?.runtimeLogs])

  const openProjectsAttention = (entry: RuntimeDatabaseLog) => {
    const projectId = extractProjectId(entry.metadata)
    const attentionType = extractAttentionType(entry.message, entry.metadata)
    openWindow('projects', {
      attentionOnly: true,
      attentionType,
      highlightProjectId: projectId ?? undefined,
      incidentMessage: entry.message,
      incidentMetadata: entry.metadata,
      incidentAt: entry.createdAt,
    })
  }

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
          <div className="panel-loading">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('system.loadingRuntime')}
          </div>
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
          <div className="panel-error-state">
            <ServerCrash className="h-5 w-5" />
            <div>
              <p className="font-semibold">{t('system.summaryLoadFailed')}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">{t('system.summaryLoadFailedHint')}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const memoryPercent = data.memory.total ? (data.memory.used / data.memory.total) * 100 : 0
  const storagePercent = data.storage.total ? (data.storage.used / data.storage.total) * 100 : 0

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
        <div className="panel-window__actions">
          <button type="button" onClick={() => void refetch()} className="panel-icon-btn" aria-label={t('system.refreshSummary')}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
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
              <HealthPill ok={data.database.connected} label={data.database.connected ? t('system.mariadbConnected') : data.database.enabled ? t('system.mariadbUnavailable') : t('system.mariadbDisabled')} />
            </div>
          </section>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <MetricCard icon={<Cpu size={15} />} title={t('system.cpuUsage')} value={`${data.cpuUsagePercent.toFixed(1)}%`} subtitle={t('system.cpuUsageSubtitle')} percent={data.cpuUsagePercent} />
            <MetricCard icon={<TimerReset size={15} />} title={t('system.systemUptime')} value={formatUptime(data.uptimeSeconds)} subtitle={t('system.systemUptimeSubtitle')} />
            <MetricCard icon={<MemoryStick size={15} />} title={t('system.memoryRam')} value={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`} subtitle={t('system.memoryRamSubtitle')} percent={memoryPercent} />
            <MetricCard icon={<HardDriveDownload size={15} />} title={t('system.storage')} value={`${formatBytes(data.storage.used)} / ${formatBytes(data.storage.total)}`} subtitle={t('system.storageSubtitle', { path: data.stateDir })} percent={storagePercent} />
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

            <InfoCard icon={<Activity size={15} />} title={t('system.portainerIntegration')}>
              <p className="panel-section-label">{t('system.endpoint')}</p>
              <code className="panel-mono block break-all text-[12px] leading-relaxed text-[var(--win-text)]">{data.portainerUrl}</code>
              <p className="panel-shell-card__meta">{t('system.portainerMeta')}</p>
            </InfoCard>

            <InfoCard icon={<Database size={15} />} title={t('system.mariadbRuntime')}>
              <p className="panel-shell-card__title">
                {data.database.connected
                  ? `${data.database.user}@${data.database.host}:${data.database.port}`
                  : data.database.enabled ? t('system.configuredNotConnected') : t('system.disabled')}
              </p>
              <p className="panel-shell-card__meta">
                {data.database.connected
                  ? t('system.databaseCounts', { logs: data.database.runtimeLogCount, changelog: data.database.changelogCount, audit: data.database.settingsAuditCount })
                  : data.database.lastError || t('system.persistenceInactive')}
              </p>
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

          <InfoCard icon={<AlertTriangle size={15} />} title={t('system.recentIncidents')}>
            {reconcileIncidents.length === 0 ? (
              <p className="panel-shell-card__meta">{t('system.noRecentIncidents')}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {reconcileIncidents.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => openProjectsAttention(entry)}
                    className="panel-muted-block rounded-[16px] px-3.5 py-3 text-left transition hover:-translate-y-[1px] hover:shadow-[var(--system-incident-hover-shadow)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`panel-badge ${entry.level === 'warning' ? 'panel-badge--warning' : entry.level === 'error' ? 'panel-badge--danger' : 'panel-badge--info'}`}>
                        {entry.level}
                      </span>
                      <span className="text-[12px] font-semibold text-[var(--win-text)]">{entry.message}</span>
                      <span className="ml-auto text-[12px] text-[var(--text-secondary)]">
                        {new Date(entry.createdAt).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                      {entry.metadata && entry.metadata !== '{}'
                        ? entry.metadata
                        : t('system.noIncidentMetadata')}
                    </p>
                    <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--panel-primary-text)]">
                      {t('system.openProjectsAttention')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </InfoCard>
        </div>
      </div>
    </div>
  )
}




