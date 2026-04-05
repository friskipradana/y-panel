import { useQuery } from '@tanstack/react-query'
import { RefreshCcw, TriangleAlert, Zap } from 'lucide-react'
import { getSystemChangelog } from '@/api/agent'
import type { ChangelogEntry } from '@/types'

const VERSION_COLORS = [
  'from-violet-600 to-purple-600',
  'from-blue-600 to-cyan-500',
  'from-emerald-600 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-rose-600 to-pink-500',
]

function versionColor(version: string) {
  const sum = version.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return VERSION_COLORS[sum % VERSION_COLORS.length]
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function TimelineEntry({ item, isLast }: { item: ChangelogEntry; isLast: boolean }) {
  return (
    <article className="group relative flex gap-4">
      <div className="flex flex-shrink-0 flex-col items-center">
        <div className={`mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-gradient-to-br ${versionColor(item.version)} ring-4 ring-white shadow-sm`} />
        {!isLast && <div className="mt-1.5 w-px flex-1 bg-slate-200/80" />}
      </div>

      <div className="mb-4 min-w-0 flex-1 rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur-sm transition-shadow duration-200 hover:shadow-md">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full bg-gradient-to-r px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white ${versionColor(item.version)}`}>
              v{item.version}
            </span>
            <span className="text-[11px] font-medium text-slate-400">{formatDate(item.releasedAt)}</span>
          </div>
          <span className="flex-shrink-0 rounded-lg bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-400">
            {formatDateTime(item.createdAt)}
          </span>
        </div>

        <h3 className="mb-1.5 text-[15px] font-semibold leading-snug text-slate-800">{item.title}</h3>
        <p className="text-[12px] leading-relaxed text-slate-500">{item.summary}</p>
      </div>
    </article>
  )
}

export function ChangelogWindow() {
  const query = useQuery({
    queryKey: ['system-changelog'],
    queryFn: getSystemChangelog,
    refetchInterval: 15_000,
    retry: 1,
  })

  if (query.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
        <RefreshCcw size={15} className="animate-spin" />
        Memuat changelog runtime...
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        Gagal memuat changelog dari backend. Pastikan agent berjalan normal dan MariaDB sudah dikonfigurasi bila ingin persistence aktif.
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#312e81_50%,#172554_100%)] p-5 text-white shadow-[0_20px_48px_rgba(15,23,42,0.18)]">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Zap size={13} className="text-violet-300" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/60">Release notes</span>
          </div>
          <h2 className="mb-1 text-xl font-bold tracking-tight">Changelog & Release Timeline</h2>
        </div>

        <button
          id="changelog-refresh"
          onClick={() => void query.refetch()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/12 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-white/20"
        >
          <RefreshCcw size={13} className={query.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {query.data.items.length === 0 && (
        <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-800">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <TriangleAlert size={14} />
            Belum ada changelog tersimpan
          </div>
          <div className="text-[12px] leading-relaxed opacity-80">
            Backend belum mengembalikan entri changelog. Pastikan seed default atau persistence MariaDB berhasil dibootstrap.
          </div>
        </div>
      )}

      {query.data.items.length > 0 && (
        <div className="flex flex-col pl-1">
          {query.data.items.map((item, index) => (
            <TimelineEntry
              key={`${item.version}-${item.id}`}
              item={item}
              isLast={index === query.data.items.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
