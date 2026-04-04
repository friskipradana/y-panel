import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, Cpu, HardDriveDownload, MemoryStick, ServerCrash, ShieldAlert, TimerReset } from 'lucide-react'
import { getSystemSummary } from '@/api/agent'

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
      style={{
        background: ok ? 'rgba(52, 211, 153, 0.14)' : 'rgba(248, 113, 113, 0.14)',
        color: ok ? '#10b981' : '#ef4444',
      }}
    >
      {ok ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
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

function MetricCard({ icon, title, value, subtitle, percent, tone = '#38bdf8' }: { icon: React.ReactNode; title: string; value: string; subtitle: string; percent?: number; tone?: string }) {
  return (
    <article
      className="rounded-[20px] border p-3.5"
      style={{
        borderColor: 'rgba(255,255,255,0.7)',
        background: 'rgba(255,255,255,0.82)',
        boxShadow: '0 14px 30px rgba(15,23,42,0.05)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2" style={{ color: 'var(--sand-600)' }}>
          {icon}
          <span className="truncate text-[12px] font-semibold">{title}</span>
        </div>
        {percent !== undefined && (
          <span className="shrink-0 text-[11px] font-semibold" style={{ color: tone }}>
            {percent.toFixed(1)}%
          </span>
        )}
      </div>
      <div
        className="mt-3 break-words text-[19px] font-semibold leading-[1.1] tracking-[-0.04em] sm:text-[22px]"
        style={{ color: 'var(--sand-600)' }}
      >
        {value}
      </div>
      <p className="mt-1.5 break-words text-[11px] leading-relaxed" style={{ color: 'var(--sand-400)' }}>
        {subtitle}
      </p>
      {percent !== undefined && (
        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.18)' }}>
          <div style={{ width: `${Math.min(percent, 100)}%`, height: '100%', background: `linear-gradient(90deg, ${tone}, rgba(255,255,255,0.92))` }} />
        </div>
      )}
    </article>
  )
}

export function SystemWindow() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['agent-system-summary'],
    queryFn: getSystemSummary,
    retry: 1,
    refetchInterval: 5_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-56 gap-3 text-sm" style={{ color: 'var(--sand-400)' }}>
        <Activity size={16} className="animate-pulse" />
        Mengambil system runtime host secara realtime...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl p-4 text-sm" style={{ background: '#ffebee', color: '#b91c1c' }}>
        <div className="flex items-center gap-2 font-semibold mb-2">
          <ServerCrash size={16} />
          Gagal memuat system summary
        </div>
        <p className="opacity-80">Pastikan kamu sudah login dan service ui-panel-agent berjalan normal.</p>
      </div>
    )
  }

  const memoryPercent = data.memory.total ? (data.memory.used / data.memory.total) * 100 : 0
  const storagePercent = data.storage.total ? (data.storage.used / data.storage.total) * 100 : 0

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-[24px] p-4 text-white" style={{ background: 'linear-gradient(135deg, #111827 0%, #172554 55%, #0f172a 100%)', boxShadow: '0 20px 44px rgba(15,23,42,0.18)' }}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Host runtime</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[22px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[24px]">
              {data.osName}
            </h2>
            <p className="mt-2 break-words text-[12px] text-white/65">{data.hostname} • kernel {data.kernel}</p>
          </div>
          <div className="min-w-[112px] rounded-[18px] px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Uptime</p>
            <p className="mt-1.5 text-base font-semibold leading-none">{formatUptime(data.uptimeSeconds)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <HealthPill ok={data.dockerInstalled} label={data.dockerInstalled ? 'Docker installed' : 'Docker missing'} />
          <HealthPill ok={data.dockerReachable} label={data.dockerReachable ? 'Docker reachable' : 'Docker unreachable'} />
          <HealthPill ok={data.portainerReachable} label={data.portainerReachable ? 'Portainer online' : 'Portainer offline'} />
        </div>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <MetricCard
          icon={<Cpu size={16} />}
          title="CPU usage"
          value={`${data.cpuUsagePercent.toFixed(1)}%`}
          subtitle="Pemakaian CPU host saat ini"
          percent={data.cpuUsagePercent}
          tone="#38bdf8"
        />
        <MetricCard
          icon={<TimerReset size={16} />}
          title="System uptime"
          value={formatUptime(data.uptimeSeconds)}
          subtitle="Durasi host menyala tanpa reboot"
          tone="#f59e0b"
        />
        <MetricCard
          icon={<MemoryStick size={16} />}
          title="Memory RAM"
          value={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`}
          subtitle="Pemakaian RAM host secara realtime"
          percent={memoryPercent}
          tone="#8b5cf6"
        />
        <MetricCard
          icon={<HardDriveDownload size={16} />}
          title="Storage"
          value={`${formatBytes(data.storage.used)} / ${formatBytes(data.storage.total)}`}
          subtitle={`Pemakaian storage pada ${data.stateDir}`}
          percent={storagePercent}
          tone="#22c55e"
        />
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <article className="rounded-[20px] border p-3.5" style={{ borderColor: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.82)', boxShadow: '0 14px 30px rgba(15,23,42,0.05)' }}>
          <div className="mb-2.5 flex items-center gap-2" style={{ color: 'var(--sand-600)' }}>
            <Activity size={16} />
            <span className="text-[13px] font-semibold">Docker status</span>
          </div>
          <p className="break-words text-[15px] font-semibold leading-snug" style={{ color: 'var(--sand-600)' }}>{data.dockerStatus}</p>
          <p className="mt-2 break-words text-[11px] leading-relaxed" style={{ color: 'var(--sand-400)' }}>
            Status ini diambil langsung dari host untuk memastikan Docker benar-benar terpasang dan daemon bisa diakses.
          </p>
        </article>

        <article className="rounded-[20px] border p-3.5" style={{ borderColor: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.82)', boxShadow: '0 14px 30px rgba(15,23,42,0.05)' }}>
          <div className="mb-2.5 flex items-center gap-2" style={{ color: 'var(--sand-600)' }}>
            <Activity size={16} />
            <span className="text-[13px] font-semibold">Portainer integration</span>
          </div>
          <p className="mb-1 text-[11px]" style={{ color: 'var(--sand-400)' }}>Endpoint</p>
          <code className="block break-all text-[11px] leading-relaxed" style={{ color: '#111827' }}>{data.portainerUrl}</code>
          <p className="mt-2.5 break-words text-[11px] leading-relaxed" style={{ color: 'var(--sand-400)' }}>
            Digunakan backend agent untuk akses Portainer secara aman dari localhost.
          </p>
        </article>
      </div>
    </div>
  )
}
