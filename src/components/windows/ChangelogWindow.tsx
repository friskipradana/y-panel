import { useQuery } from '@tanstack/react-query'
import { BellRing, RefreshCcw, TriangleAlert, Zap } from 'lucide-react'
import { getSystemChangelog } from '@/api/agent'
import type { ChangelogEntry } from '@/types'

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
    <article className="panel-timeline__item">
      <div className="panel-timeline__rail">
        <div className="panel-timeline__dot" />
        {!isLast ? <div className="panel-timeline__line" /> : null}
      </div>

      <div className="panel-timeline__content">
        <div className="panel-card p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="panel-badge panel-badge--info">v{item.version}</span>
              <span className="panel-meta-line">{formatDate(item.releasedAt)}</span>
            </div>
            <span className="panel-muted-block panel-mono rounded-[10px] px-2 py-1 text-[10px]">{formatDateTime(item.createdAt)}</span>
          </div>

          <h3 className="text-[15px] font-semibold leading-snug text-[var(--win-text)]">{item.title}</h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{item.summary}</p>
        </div>
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

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <BellRing className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Changelog</div>
            <div className="panel-window__meta">Timeline rilis dan perubahan sistem</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button
            id="changelog-refresh"
            type="button"
            onClick={() => void query.refetch()}
            className="panel-icon-btn"
            aria-label="Refresh changelog"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">
              <Zap className="h-3 w-3" />
              Release notes
            </div>
            <div className="panel-hero__title">Changelog & Release Timeline</div>
            <p className="panel-hero__description">
              Semua update penting dari backend dan runtime ditampilkan dalam urutan waktu yang rapi agar perubahan versi lebih mudah ditelusuri.
            </p>
          </section>

          {query.isLoading ? (
            <div className="panel-loading">
              <RefreshCcw className="h-4 w-4 animate-spin" />
              Memuat changelog runtime...
            </div>
          ) : query.isError || !query.data ? (
            <div className="panel-error-state">
              <TriangleAlert className="h-5 w-5" />
              <div>
                <p className="font-semibold">Gagal memuat changelog dari backend</p>
                <p className="mt-1 text-[12px] leading-6 opacity-90">Pastikan agent berjalan normal dan MariaDB sudah dikonfigurasi bila ingin persistence aktif.</p>
              </div>
            </div>
          ) : query.data.items.length === 0 ? (
            <div className="panel-empty">
              <TriangleAlert className="h-8 w-8" />
              <span>Belum ada changelog tersimpan.</span>
            </div>
          ) : (
            <div className="panel-timeline">
              {query.data.items.map((item, index) => (
                <TimelineEntry key={`${item.version}-${item.id}`} item={item} isLast={index === query.data.items.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
