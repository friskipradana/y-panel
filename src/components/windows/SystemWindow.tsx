import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Boxes, CheckCircle2, Cpu, Database, Globe2, HardDrive, HardDriveDownload, Layers, MemoryStick, Network, RefreshCw, ShieldAlert, Users, Waypoints } from 'lucide-react'
import { getSystemSummary } from '@/api/agent'
import type { SystemCounts } from '@/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { KpiCard } from '@/components/ui/KpiCard'
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

function SystemBar({ summary, onRefresh, fetching, refreshLabel }: { summary: ReactNode; onRefresh?: () => void; fetching?: boolean; refreshLabel: string }) {
  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left min-w-0 text-xs text-[var(--text-secondary)]">{summary}</div>
      {onRefresh ? (
        <div className="docker-topbar__right">
          <button type="button" className="docker-icon-btn" title={refreshLabel} aria-label={refreshLabel} onClick={onRefresh}>
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

// The counting sections of the window; each card shows only what the agent sent for this viewer
function CountSections({ counts, t }: { counts?: SystemCounts; t: (key: string, params?: Record<string, string | number>) => string }) {
  if (!counts) return null
  const { docker, databases, routes, users, cloudflare } = counts
  const cards: { title: string; items: ReactNode[] }[] = []

  if (docker) {
    const items: ReactNode[] = [
      <KpiCard key="containers" icon={<Boxes size={15} />} title={t('system.count.containers')} value={`${docker.running} / ${docker.containers}`} subtitle={docker.reachable ? t('system.count.containersHint') : t('system.count.dockerOff')} />,
    ]
    if (docker.images !== undefined) items.push(<KpiCard key="images" icon={<Layers size={15} />} title={t('system.count.images')} value={`${docker.images}`} subtitle={t('system.count.imagesHint')} />)
    if (docker.volumes !== undefined) items.push(<KpiCard key="volumes" icon={<HardDrive size={15} />} title={t('system.count.volumes')} value={`${docker.volumes}`} subtitle={t('system.count.volumesHint')} />)
    if (docker.networks !== undefined) items.push(<KpiCard key="networks" icon={<Waypoints size={15} />} title={t('system.count.networks')} value={`${docker.networks}`} subtitle={t('system.count.networksHint')} />)
    cards.push({ title: t('system.sectionDocker'), items })
  }

  const data: ReactNode[] = []
  if (databases) data.push(<KpiCard key="databases" icon={<Database size={15} />} title={t('system.count.databases')} value={`${databases.running} / ${databases.total}`} subtitle={t('system.count.databasesHint')} />)
  if (routes) data.push(<KpiCard key="routes" icon={<Network size={15} />} title={t('system.count.routes')} value={`${routes.active} / ${routes.total}`} subtitle={t('system.count.routesHint')} />)
  if (cloudflare) {
    if (!cloudflare.configured) data.push(<KpiCard key="cf" icon={<Globe2 size={15} />} title={t('system.count.domains')} value="-" subtitle={t('system.count.cloudflareOff')} />)
    else if (!cloudflare.reachable) data.push(<KpiCard key="cf" icon={<Globe2 size={15} />} title={t('system.count.domains')} value="-" subtitle={t('system.count.cloudflareUnreachable')} />)
    else {
      data.push(<KpiCard key="zones" icon={<Globe2 size={15} />} title={t('system.count.domains')} value={`${cloudflare.zonesActive} / ${cloudflare.zones}`} subtitle={t('system.count.domainsHint')} />)
      data.push(<KpiCard key="profiles" icon={<Waypoints size={15} />} title={t('system.count.tunnels')} value={`${cloudflare.profilesLive} / ${cloudflare.profiles}`} subtitle={t('system.count.tunnelsHint')} />)
    }
  }
  if (data.length > 0) cards.push({ title: t('system.sectionData'), items: data })

  if (users) {
    const items: ReactNode[] = [
      <KpiCard key="users" icon={<Users size={15} />} title={t('system.count.users')} value={`${users.active} / ${users.total}`} subtitle={t('system.count.usersHint', { suspended: users.suspended })} />,
    ]
    const roles = Object.entries(users.roles ?? {}).filter(([, count]) => count > 0)
    if (roles.length > 1) items.push(<KpiCard key="roles" icon={<ShieldAlert size={15} />} title={t('system.count.roles')} value={roles.map(([role, count]) => `${count} ${role}`).join(' \u00b7 ')} subtitle={t('system.count.rolesHint')} />)
    if (users.planActive !== undefined) {
      items.push(<KpiCard key="plans" icon={<CheckCircle2 size={15} />} title={t('system.count.plans')} value={`${users.planActive}`} subtitle={t('system.count.plansHint', { expiring: users.expiring ?? 0, grace: users.grace ?? 0, expired: users.expired ?? 0 })} />)
    }
    cards.push({ title: t('system.sectionUsers'), items })
  }

  return (
    <>
      {cards.map((card) => (
        <section key={card.title} className="space-y-2">
          <p className="panel-section-label">{card.title}</p>
          <div className="panel-kpi-grid panel-kpi-grid--auto">{card.items}</div>
        </section>
      ))}
    </>
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
      <div className="panel-window docker-window-root">
        <SystemBar summary={<span className="font-semibold text-[var(--win-text)]">{t('system.overviewTitle')}</span>} refreshLabel={t('system.refreshSummary')} />
        <div className="panel-window__body">
          <LoadingState>{t('system.loadingRuntime')}</LoadingState>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="panel-window docker-window-root">
        <SystemBar summary={<span className="font-semibold text-[var(--win-text)]">{t('system.overviewTitle')}</span>} refreshLabel={t('system.refreshSummary')} />
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
      <div className="panel-window docker-window-root">
        <SystemBar
          summary={<><span className="font-semibold text-[var(--win-text)]">{data.hostname}</span> &middot; {t('system.account.scope')}</>}
          onRefresh={() => void refetch()}
          fetching={isFetching}
          refreshLabel={t('system.refreshSummary')}
        />
        <div className="panel-window__body">
          <div className="panel-window__stack">
            <div className="panel-kpi-grid panel-kpi-grid--auto">
              <KpiCard icon={<Cpu size={15} />} title={t('system.cpuUsage')} value={a.cpuLimitPct ? `${a.cpuPercent.toFixed(1)}%` : `${a.cpuCores.toFixed(2)} core`} subtitle={a.cpuLimitPct ? t('system.account.cpuOf', { cores: (a.cpuLimitPct / 100).toFixed(2) }) : unlimited} percent={a.cpuLimitPct ? a.cpuPercent : undefined} />
              <KpiCard icon={<MemoryStick size={15} />} title={t('system.memoryRam')} value={a.memLimit ? `${formatBytes(a.memUsed)} / ${formatBytes(a.memLimit)}` : formatBytes(a.memUsed)} subtitle={a.memLimit ? t('system.account.ofQuota') : unlimited} percent={a.memLimit ? memPct : undefined} />
              <KpiCard icon={<HardDriveDownload size={15} />} title={t('system.storage')} value={a.diskLimit ? `${formatBytes(a.diskUsed)} / ${formatBytes(a.diskLimit)}` : formatBytes(a.diskUsed)} subtitle={a.diskLimit ? t('system.account.ofQuota') : unlimited} percent={a.diskLimit ? diskPct : undefined} />
              <KpiCard icon={<Activity size={15} />} title={t('system.projectsTotal')} value={`${data.projects?.total ?? 0}`} subtitle={t('system.projectsActiveCount', { count: data.projects?.active ?? 0 })} />
            </div>
            <CountSections counts={data.counts} t={t} />
            <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('system.account.note')}</p>
          </div>
        </div>
      </div>
    )
  }

  const memoryPercent = data.memory.total ? (data.memory.used / data.memory.total) * 100 : 0
  const storagePercent = data.storage.total ? (data.storage.used / data.storage.total) * 100 : 0

  return (
    <div className="panel-window docker-window-root">
      <SystemBar
        summary={
          <>
            <span className="font-semibold text-[var(--win-text)]">{data.osName}</span>
            <span className="mx-2">&middot;</span>
            <span>{data.hostname}</span>
            <span className="mx-2">&middot;</span>
            <span className="font-medium text-[var(--panel-primary-text)]">{t('system.uptime')} {formatUptime(data.uptimeSeconds)}</span>
          </>
        }
        onRefresh={() => void refetch()}
        fetching={isFetching}
        refreshLabel={t('system.refreshSummary')}
      />

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <section className="panel-shell-card">
            <p className="panel-section-label">{t('system.hostRuntime')}</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <p className="text-[1.25rem] font-bold tracking-tight text-[var(--win-text)]">{data.osName}</p>
                <p className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">{data.hostname} &middot; kernel {data.kernel}</p>
              </div>
              <div className="text-right">
                <p className="panel-section-label">{t('system.uptime')}</p>
                <p className="text-[1rem] font-bold text-[var(--win-text)]">{formatUptime(data.uptimeSeconds)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <HealthPill ok={data.dockerInstalled} label={data.dockerInstalled ? t('system.dockerInstalled') : t('system.dockerMissing')} />
              <HealthPill ok={data.dockerReachable} label={data.dockerReachable ? t('system.dockerReachable') : t('system.dockerUnreachable')} />
            </div>
          </section>

          <section className="space-y-2">
            <p className="panel-section-label">{t('system.sectionResources')}</p>
            <div className="panel-kpi-grid panel-kpi-grid--auto">
              <KpiCard icon={<Cpu size={15} />} title={t('system.cpuUsage')} value={`${data.cpuUsagePercent.toFixed(1)}%`} subtitle={t('system.cpuUsageSubtitle')} percent={data.cpuUsagePercent} />
              <KpiCard icon={<MemoryStick size={15} />} title={t('system.memoryRam')} value={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`} subtitle={t('system.memoryRamSubtitle')} percent={memoryPercent} />
              <KpiCard icon={<HardDriveDownload size={15} />} title={t('system.storage')} value={`${formatBytes(data.storage.used)} / ${formatBytes(data.storage.total)}`} subtitle={t('system.storageSubtitleShort')} percent={storagePercent} />
            </div>
          </section>

          <section className="space-y-2">
            <p className="panel-section-label">{t('system.sectionWorkloads')}</p>
            <div className="panel-kpi-grid panel-kpi-grid--auto">
              <KpiCard icon={<Activity size={15} />} title={t('system.projectsTotal')} value={`${data.projects?.total ?? 0}`} subtitle={t('system.projectsTotalSubtitle')} />
              <KpiCard icon={<CheckCircle2 size={15} />} title={t('system.projectsActive')} value={`${data.projects?.active ?? 0}`} subtitle={t('system.projectsActiveSubtitle')} />
              <KpiCard icon={<ShieldAlert size={15} />} title={t('system.needAttention')} value={`${data.projects?.attention ?? 0}`} subtitle={t('system.needAttentionSubtitle')} percent={data.projects?.total ? (data.projects.attention / data.projects.total) * 100 : 0} />
              <KpiCard icon={<AlertTriangle size={15} />} title={t('system.runtimeDrift')} value={`${data.projects?.drift ?? 0}`} subtitle={data.projects?.reconcileFresh ? t('system.reconcileFresh') : t('system.reconcileStale')} />
            </div>
          </section>

          <CountSections counts={data.counts} t={t} />

          <section className="space-y-2">
            <p className="panel-section-label">{t('system.sectionServices')}</p>
            <div className="panel-kpi-grid panel-kpi-grid--auto">
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
          </section>
        </div>
      </div>
    </div>
  )
}
