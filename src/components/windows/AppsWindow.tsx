import { useContainers, useStartContainer, useStopContainer } from '@/hooks/useContainers'
import type { Container } from '@/types'

const APP_ICONS: Record<string, string> = {
  grafana: '📊',
  portainer: '🐋',
  uptime: '💓',
  jellyfin: '🎬',
  nextcloud: '☁️',
  nginx: '🌐',
  postgres: '🐘',
  redis: '⚡',
  default: '📦',
}

function getIcon(name: string): string {
  const lower = name.toLowerCase()
  return Object.entries(APP_ICONS).find(([k]) => lower.includes(k))?.[1] ?? APP_ICONS.default
}

const STATE_STYLES: Record<Container['State'], { badge: string; dot: string; btn: string; btnText: string }> = {
  running:    { badge: 'bg-emerald-50 text-emerald-700',  dot: 'bg-emerald-500', btn: 'bg-red-50 text-red-700 hover:bg-red-100',      btnText: 'Stop' },
  exited:     { badge: 'bg-red-50 text-red-700',          dot: 'bg-red-400',     btn: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', btnText: 'Start' },
  paused:     { badge: 'bg-amber-50 text-amber-700',      dot: 'bg-amber-400',   btn: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', btnText: 'Start' },
  restarting: { badge: 'bg-blue-50 text-blue-700',        dot: 'bg-blue-400',    btn: 'bg-red-50 text-red-700 hover:bg-red-100',      btnText: 'Stop' },
  dead:       { badge: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400',   btn: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', btnText: 'Start' },
}

function StatusBadge({ state }: { state: Container['State'] }) {
  const s = STATE_STYLES[state] ?? STATE_STYLES.dead
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {state}
    </span>
  )
}

export function AppsWindow() {
  const { data, isLoading, isError, error } = useContainers()
  const startMutation = useStartContainer()
  const stopMutation  = useStopContainer()
  const containers    = Array.isArray(data) ? data : []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 gap-3 text-sm text-slate-400">
        <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Menghubungkan ke runtime agent...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-semibold mb-1">Tidak bisa memuat container dari agent</p>
        <p className="text-[11px] opacity-80">{(error as Error).message}</p>
        <p className="text-[11px] mt-2 opacity-60">Pastikan ui-panel-agent aktif dan Docker dapat diakses oleh backend.</p>
      </div>
    )
  }

  if (containers.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-5 text-sm text-slate-500">
        <p className="font-semibold mb-1 text-slate-700">Belum ada container aktif</p>
        <p className="text-[11px] leading-relaxed">
          Runtime agent berhasil dijangkau, tetapi saat ini belum ada container yang bisa ditampilkan.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-slate-400 font-medium">
        {containers.length} container · auto-refresh tiap 10 detik
      </p>
      <div className="flex flex-col gap-2">
        {containers.map((c) => {
          const name = c.Names?.[0]?.replace(/^\//, '') || c.Id.slice(0, 12)
          const s = STATE_STYLES[c.State] ?? STATE_STYLES.dead
          const isMutating = startMutation.isPending || stopMutation.isPending

          return (
            <div
              key={c.Id}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white/80 backdrop-blur-sm hover:bg-white transition-colors"
            >
              <span className="text-xl flex-shrink-0">{getIcon(name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 truncate">{name}</p>
                <p className="text-[11px] text-slate-400 truncate">{c.Image}</p>
              </div>
              <StatusBadge state={c.State} />
              <button
                className={`text-[11px] px-2.5 py-1.5 rounded-lg font-semibold transition-colors flex-shrink-0 cursor-pointer ${s.btn}`}
                onClick={() => c.State === 'running' ? stopMutation.mutate(c.Id) : startMutation.mutate(c.Id)}
                disabled={isMutating}
              >
                {s.btnText}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
