import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, Cpu, Database, HardDriveDownload, MemoryStick, Network, RefreshCw, ServerCrash, ShieldAlert, TimerReset } from 'lucide-react'
import { getSystemSummary } from '@/api/agent'

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
        {percent !== undefined ? <span className="text-[11px] font-bold text-[var(--panel-primary-text)]">{percent.toFixed(1)}%</span> : null}
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
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['agent-system-summary'],
    queryFn: getSystemSummary,
    retry: 1,
    refetchInterval: 5_000,
  })

  useEffect(() => {
    if (authenticated) {
      void refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  if (isLoading) {
    return (
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Cpu className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">System Overview</div>
              <div className="panel-window__meta">Ringkasan runtime host dan integrasi inti</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <div className="panel-loading">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Mengambil system runtime host secara realtime...
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
              <div className="panel-window__title-text">System Overview</div>
              <div className="panel-window__meta">Ringkasan runtime host dan integrasi inti</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <div className="panel-error-state">
            <ServerCrash className="h-5 w-5" />
            <div>
              <p className="font-semibold">Gagal memuat system summary</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">Pastikan kamu sudah login dan service ui-panel-agent berjalan normal.</p>
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
            <div className="panel-window__title-text">System Overview</div>
            <div className="panel-window__meta">Ringkasan runtime host dan integrasi inti</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button type="button" onClick={() => void refetch()} className="panel-icon-btn" aria-label="Refresh system summary">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">Host runtime</div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="panel-hero__title">{data.osName}</div>
                <p className="panel-hero__description">{data.hostname} · kernel {data.kernel}</p>
              </div>
              <div className="panel-shell-card min-w-[140px] p-3 shadow-none">
                <div className="panel-section-label">Uptime</div>
                <p className="text-base font-bold text-[var(--win-text)]">{formatUptime(data.uptimeSeconds)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <HealthPill ok={data.dockerInstalled} label={data.dockerInstalled ? 'Docker installed' : 'Docker missing'} />
              <HealthPill ok={data.dockerReachable} label={data.dockerReachable ? 'Docker reachable' : 'Docker unreachable'} />
              <HealthPill ok={data.portainerReachable} label={data.portainerReachable ? 'Portainer online' : 'Portainer offline'} />
              <HealthPill ok={data.database.connected} label={data.database.connected ? 'MariaDB connected' : data.database.enabled ? 'MariaDB unavailable' : 'MariaDB disabled'} />
            </div>
          </section>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <MetricCard icon={<Cpu size={15} />} title="CPU usage" value={`${data.cpuUsagePercent.toFixed(1)}%`} subtitle="Pemakaian CPU host saat ini" percent={data.cpuUsagePercent} />
            <MetricCard icon={<TimerReset size={15} />} title="System uptime" value={formatUptime(data.uptimeSeconds)} subtitle="Durasi host menyala tanpa reboot" />
            <MetricCard icon={<MemoryStick size={15} />} title="Memory RAM" value={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`} subtitle="Pemakaian RAM host secara realtime" percent={memoryPercent} />
            <MetricCard icon={<HardDriveDownload size={15} />} title="Storage" value={`${formatBytes(data.storage.used)} / ${formatBytes(data.storage.total)}`} subtitle={`Pemakaian storage pada ${data.stateDir}`} percent={storagePercent} />
          </div>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <InfoCard icon={<Activity size={15} />} title="Docker status">
              <p className="panel-shell-card__title">{data.dockerStatus}</p>
              <p className="panel-shell-card__meta">Status ini diambil langsung dari host untuk memastikan Docker benar-benar terpasang dan daemon bisa diakses.</p>
            </InfoCard>

            <InfoCard icon={<Activity size={15} />} title="Portainer integration">
              <p className="panel-section-label">Endpoint</p>
              <code className="panel-mono block break-all text-[11px] leading-relaxed text-[var(--win-text)]">{data.portainerUrl}</code>
              <p className="panel-shell-card__meta">Digunakan backend agent untuk akses Portainer secara aman dari localhost.</p>
            </InfoCard>

            <InfoCard icon={<Database size={15} />} title="MariaDB runtime">
              <p className="panel-shell-card__title">
                {data.database.connected
                  ? `${data.database.user}@${data.database.host}:${data.database.port}`
                  : data.database.enabled ? 'Configured but not connected' : 'Disabled'}
              </p>
              <p className="panel-shell-card__meta">
                {data.database.connected
                  ? `${data.database.runtimeLogCount} runtime logs · ${data.database.changelogCount} changelog · ${data.database.settingsAuditCount} audit rows`
                  : data.database.lastError || 'Persistence belum aktif.'}
              </p>
            </InfoCard>

            <InfoCard icon={<Network size={15} />} title="IP Address">
              {data.ipAddresses && data.ipAddresses.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.ipAddresses.map((ip) => (
                    <code key={ip} className="panel-muted-block panel-mono block break-all px-2.5 py-1.5 text-[11px] text-[var(--win-text)]">{ip}</code>
                  ))}
                </div>
              ) : (
                <p className="panel-shell-card__meta">Tidak ada interface aktif.</p>
              )}
            </InfoCard>
          </div>
        </div>
      </div>
    </div>
  )
}
