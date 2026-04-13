import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, Cpu, Database, HardDriveDownload, MemoryStick, Network, ServerCrash, ShieldAlert, TimerReset } from 'lucide-react'
import { getSystemSummary } from '@/api/agent'

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${ok ? 'bg-emerald-500/[0.12] text-emerald-600' : 'bg-red-500/[0.12] text-red-500'}`}>
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

function percentToneClass(tone: 'sky' | 'amber' | 'violet' | 'emerald') {
  return {
    sky: 'text-sky-500 bg-gradient-to-r from-sky-400 to-sky-100/80',
    amber: 'text-amber-500 bg-gradient-to-r from-amber-400 to-amber-100/80',
    violet: 'text-violet-500 bg-gradient-to-r from-violet-500 to-violet-100/80',
    emerald: 'text-emerald-500 bg-gradient-to-r from-emerald-500 to-emerald-100/80',
  }[tone]
}

function MetricCard({ icon, title, value, subtitle, percent, tone = 'sky' }: {
  icon: React.ReactNode
  title: string
  value: string
  subtitle: string
  percent?: number
  tone?: 'sky' | 'amber' | 'violet' | 'emerald'
}) {
  const toneClass = percentToneClass(tone)
  const textTone = toneClass.split(' ')[0]
  const barTone = toneClass.split(' ').slice(1).join(' ')

  return (
    <article className="rounded-2xl border border-white/70 bg-white/82 p-3.5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-slate-600">
          {icon}
          <span className="truncate text-[12px] font-semibold">{title}</span>
        </div>
        {percent !== undefined && (
          <span className={`flex-shrink-0 text-[11px] font-bold ${textTone}`}>
            {percent.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mb-1.5 break-words text-[19px] font-bold leading-none tracking-tight text-slate-700 sm:text-[22px]">
        {value}
      </div>
      <p className="break-words text-[11px] leading-relaxed text-slate-400">{subtitle}</p>
      {percent !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barTone}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </article>
  )
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-white/70 bg-white/82 p-3.5 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2 text-slate-600">
        {icon}
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      {children}
    </article>
  )
}

export function SystemWindow({ authenticated }: { authenticated?: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery({
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
      <div className="flex h-56 items-center justify-center gap-2 text-sm text-slate-400">
        <Activity size={15} className="animate-pulse" />
        Mengambil system runtime host secara realtime...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        <div className="mb-1.5 flex items-center gap-2 font-semibold">
          <ServerCrash size={15} />
          Gagal memuat system summary
        </div>
        <p className="text-[12px] opacity-80">Pastikan kamu sudah login dan service ui-panel-agent berjalan normal.</p>
      </div>
    )
  }

  const memoryPercent = data.memory.total ? (data.memory.used / data.memory.total) * 100 : 0
  const storagePercent = data.storage.total ? (data.storage.used / data.storage.total) * 100 : 0

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-2xl bg-[linear-gradient(135deg,#111827_0%,#172554_55%,#0f172a_100%)] p-4 text-white shadow-[0_20px_44px_rgba(15,23,42,0.18)]">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-white/45">Host runtime</p>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[22px] font-bold leading-tight tracking-tight sm:text-[24px]">{data.osName}</h2>
            <p className="mt-1.5 break-words text-[12px] text-white/60">{data.hostname} · kernel {data.kernel}</p>
          </div>
          <div className="flex-shrink-0 rounded-2xl border border-white/10 bg-white/8 px-3.5 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Uptime</p>
            <p className="mt-1.5 text-base font-bold leading-none">{formatUptime(data.uptimeSeconds)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <HealthPill ok={data.dockerInstalled} label={data.dockerInstalled ? 'Docker installed' : 'Docker missing'} />
          <HealthPill ok={data.dockerReachable} label={data.dockerReachable ? 'Docker reachable' : 'Docker unreachable'} />
          <HealthPill ok={data.portainerReachable} label={data.portainerReachable ? 'Portainer online' : 'Portainer offline'} />
          <HealthPill ok={data.database.connected} label={data.database.connected ? 'MariaDB connected' : data.database.enabled ? 'MariaDB unavailable' : 'MariaDB disabled'} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Cpu size={15} />}
          title="CPU usage"
          value={`${data.cpuUsagePercent.toFixed(1)}%`}
          subtitle="Pemakaian CPU host saat ini"
          percent={data.cpuUsagePercent}
          tone="sky"
        />
        <MetricCard
          icon={<TimerReset size={15} />}
          title="System uptime"
          value={formatUptime(data.uptimeSeconds)}
          subtitle="Durasi host menyala tanpa reboot"
          tone="amber"
        />
        <MetricCard
          icon={<MemoryStick size={15} />}
          title="Memory RAM"
          value={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`}
          subtitle="Pemakaian RAM host secara realtime"
          percent={memoryPercent}
          tone="violet"
        />
        <MetricCard
          icon={<HardDriveDownload size={15} />}
          title="Storage"
          value={`${formatBytes(data.storage.used)} / ${formatBytes(data.storage.total)}`}
          subtitle={`Pemakaian storage pada ${data.stateDir}`}
          percent={storagePercent}
          tone="emerald"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard icon={<Activity size={15} />} title="Docker status">
          <p className="mb-2 break-words text-[15px] font-bold leading-snug text-slate-700">{data.dockerStatus}</p>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Status ini diambil langsung dari host untuk memastikan Docker benar-benar terpasang dan daemon bisa diakses.
          </p>
        </InfoCard>

        <InfoCard icon={<Activity size={15} />} title="Portainer integration">
          <p className="mb-1 text-[11px] text-slate-400">Endpoint</p>
          <code className="mb-2 block break-all text-[11px] leading-relaxed text-slate-800">{data.portainerUrl}</code>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Digunakan backend agent untuk akses Portainer secara aman dari localhost.
          </p>
        </InfoCard>

        <InfoCard icon={<Database size={15} />} title="MariaDB runtime">
          <p className="mb-2 break-words text-[15px] font-bold leading-snug text-slate-700">
            {data.database.connected
              ? `${data.database.user}@${data.database.host}:${data.database.port}`
              : data.database.enabled ? 'Configured but not connected' : 'Disabled'}
          </p>
          <p className="break-words text-[11px] leading-relaxed text-slate-400">
            {data.database.connected
              ? `${data.database.runtimeLogCount} runtime logs · ${data.database.changelogCount} changelog · ${data.database.settingsAuditCount} audit rows`
              : data.database.lastError || 'Persistence belum aktif.'}
          </p>
        </InfoCard>

        <InfoCard icon={<Network size={15} />} title="IP Address">
          {data.ipAddresses && data.ipAddresses.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {data.ipAddresses.map((ip) => (
                <code key={ip} className="block break-all rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-800">
                  {ip}
                </code>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-slate-400">Tidak ada interface aktif.</p>
          )}
        </InfoCard>
      </div>
    </div>
  )
}
