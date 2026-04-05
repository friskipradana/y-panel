import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivitySquare, Database, HardDriveDownload, RefreshCcw, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { getDatabaseStatus } from '@/api/agent'

const LOG_ROW_OPTIONS = [10, 20, 40, 80]

export function DatabaseWindow() {
  const query = useQuery({
    queryKey: ['database-status'],
    queryFn: getDatabaseStatus,
    refetchInterval: 8000,
    retry: 1,
  })

  const [logQuery, setLogQuery] = useState('')
  const [logLimit, setLogLimit] = useState(10)

  const status = query.data?.status
  const runtimeLogs = query.data?.runtimeLogs ?? []
  const settingsAudit = query.data?.settingsAudit ?? []

  const filteredRuntimeLogs = useMemo(() => {
    const keyword = logQuery.trim().toLowerCase()
    const source = keyword
      ? runtimeLogs.filter((entry) => {
          const haystack = [entry.service, entry.level, entry.message, entry.metadata ?? '']
            .join(' ')
            .toLowerCase()
          return haystack.includes(keyword)
        })
      : runtimeLogs
    return source.slice(0, logLimit)
  }, [runtimeLogs, logQuery, logLimit])

  if (query.isLoading) {
    return (
      <div className="flex h-56 items-center justify-center gap-3 text-sm text-slate-400">
        <RefreshCcw size={16} className="animate-spin" />
        Memuat status MariaDB runtime...
      </div>
    )
  }

  if (query.isError || !query.data || !status) {
    return (
      <div className="rounded-[24px] border border-red-400/25 bg-red-50/95 p-4 text-sm text-red-700">
        Gagal memuat status database runtime. Pastikan MariaDB sudah tersedia dan env koneksi Phase 2 sudah benar.
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      <div className="rounded-[24px] bg-[linear-gradient(135deg,#111827_0%,#0f172a_45%,#172554_100%)] p-4 text-white shadow-[0_24px_50px_rgba(15,23,42,0.18)] sm:rounded-[28px] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/82">
              <Database size={12} />
              Phase 2 persistence
            </div>
            <h2 className="mt-3 max-w-[680px] text-[18px] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[22px] lg:text-[28px]">
              MariaDB runtime health
            </h2>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-white/72 sm:text-[12px]">
              Pantau koneksi database, jumlah data persistensi, runtime log terbaru, dan jejak audit perubahan host dari backend UI Panel.
            </p>
          </div>
          <button
            id="database-refresh"
            onClick={() => void query.refetch()}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/14 bg-white/10 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-white/15"
          >
            <RefreshCcw size={14} className={query.isFetching ? 'animate-spin' : ''} />
            Refresh status
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<ShieldCheck size={16} />}
          label="Connection"
          value={status.connected ? 'Connected' : status.enabled ? 'Unavailable' : 'Disabled'}
          accent="emerald"
          description={status.connected ? `${status.user}@${status.host}:${status.port}` : status.lastError || 'Belum ada koneksi MariaDB aktif.'}
        />
        <MetricCard
          icon={<HardDriveDownload size={16} />}
          label="Runtime logs"
          value={String(status.runtimeLogCount)}
          accent="sky"
          description="Jumlah log backend yang berhasil dipersist ke MariaDB."
        />
        <MetricCard
          icon={<ActivitySquare size={16} />}
          label="Changelog rows"
          value={String(status.changelogCount)}
          accent="violet"
          description="Jumlah entri changelog yang tersedia dari database runtime."
        />
        <MetricCard
          icon={<Database size={16} />}
          label="Settings audit"
          value={String(status.settingsAuditCount)}
          accent="amber"
          description="Jumlah audit perubahan hostname/timezone/nameserver yang tercatat."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <section className="rounded-[24px] border border-white/74 bg-white/84 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.07)] backdrop-blur-[18px] sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[16px] bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(99,102,241,0.14))] text-slate-900">
              <Database size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-slate-700">Connection details</div>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                Snapshot koneksi MariaDB yang dibaca dari runtime env installer.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-[12px]">
            <DetailRow label="Enabled" value={status.enabled ? 'Yes' : 'No'} />
            <DetailRow label="Host" value={status.host || '-'} />
            <DetailRow label="Port" value={String(status.port || 0)} />
            <DetailRow label="Database" value={status.database || '-'} />
            <DetailRow label="User" value={status.user || '-'} />
            <DetailRow label="Last error" value={status.lastError || 'No recent errors'} tone={status.lastError ? 'warning' : 'normal'} />
          </div>
        </section>

        <section className="flex min-h-[340px] max-h-[520px] flex-col overflow-hidden rounded-[24px] border border-slate-900/8 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(15,23,42,0.98))] shadow-[0_22px_40px_rgba(2,6,23,0.22)]">
          <div className="border-b border-slate-400/16 px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold text-slate-100">Persisted runtime logs</div>
              <div className="text-[11px] text-slate-400">Latest {filteredRuntimeLogs.length} / {runtimeLogs.length} rows</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="database-log-search"
                  value={logQuery}
                  onChange={(e) => setLogQuery(e.target.value)}
                  placeholder="Filter logs by service, level, message..."
                  className="h-9 w-full rounded-xl border border-slate-700/70 bg-slate-900/80 pl-9 pr-3 text-[12px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-500/60"
                />
              </div>

              <select
                id="database-log-limit"
                value={logLimit}
                onChange={(e) => setLogLimit(Number(e.target.value))}
                className="h-9 rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 text-[12px] font-medium text-slate-100 outline-none transition focus:border-sky-500/60"
              >
                {LOG_ROW_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} rows</option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {runtimeLogs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-[12px] text-slate-400">
                Belum ada runtime log di database. Setelah MariaDB aktif, request backend akan mulai disimpan di sini.
              </div>
            ) : filteredRuntimeLogs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-[12px] text-slate-400">
                Tidak ada log yang cocok dengan filter saat ini.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredRuntimeLogs.map((entry) => {
                  const isError = entry.level === 'error'
                  return (
                    <div
                      key={entry.id}
                      className={[
                        'rounded-[18px] border px-3 py-3',
                        isError
                          ? 'border-red-400/24 bg-red-950/20'
                          : 'border-slate-400/14 bg-slate-900/72',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        <span>{entry.service}</span>
                        <span>•</span>
                        <span>{entry.level}</span>
                        <span>•</span>
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="mt-2 text-[13px] font-medium text-slate-100">{entry.message}</div>
                      {entry.metadata ? (
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-[14px] bg-black/20 px-3 py-2 text-[11px] leading-5 text-slate-300">
                          {entry.metadata}
                        </pre>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-white/74 bg-white/84 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.07)] backdrop-blur-[18px] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-slate-700">Recent settings audit</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Riwayat perubahan hostname, timezone, dan nameserver yang dikirim dari window settings.
            </p>
          </div>
          <div className="rounded-full bg-amber-500/12 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-700">
            {settingsAudit.length} rows
          </div>
        </div>
        <div className="mt-4 flex max-h-[360px] flex-col gap-3 overflow-auto pr-1">
          {settingsAudit.length === 0 ? (
            <div className="rounded-[16px] border border-slate-200/88 bg-white/90 px-3 py-3 text-[12px] leading-relaxed text-slate-400">
              Belum ada audit perubahan settings yang tersimpan.
            </div>
          ) : (
            settingsAudit.map((entry) => (
              <div key={entry.id} className="rounded-[18px] border border-amber-500/18 bg-white/92 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  <span>{entry.username || 'system'}</span>
                  <span>•</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 grid gap-2 text-[12px] text-slate-700 sm:grid-cols-3">
                  <div><strong>Hostname:</strong> {entry.hostname || '-'}</div>
                  <div><strong>Timezone:</strong> {entry.timezone || '-'}</div>
                  <div>
                    <strong>Nameserver:</strong>{' '}
                    {entry.nameservers.length > 0 ? entry.nameservers.join(', ') : '—'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {!status.connected && status.enabled && (
        <div className="rounded-[18px] border border-orange-500/24 bg-orange-50/92 px-4 py-3 text-[12px] text-orange-900">
          <div className="flex items-center gap-2 font-semibold">
            <TriangleAlert size={15} />
            MariaDB belum siap
          </div>
          <div className="mt-1 leading-relaxed">
            Jalankan installer Linux terbaru agar MariaDB dibootstrap otomatis, lalu verifikasi nilai env `PANEL_DB_*` pada runtime service.
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, description, accent }: { icon: React.ReactNode; label: string; value: string; description: string; accent: 'emerald' | 'sky' | 'violet' | 'amber' }) {
  const accentMap = {
    emerald: {
      iconBg: 'bg-emerald-500/12 text-emerald-600',
    },
    sky: {
      iconBg: 'bg-sky-500/12 text-sky-600',
    },
    violet: {
      iconBg: 'bg-violet-500/12 text-violet-600',
    },
    amber: {
      iconBg: 'bg-amber-500/12 text-amber-600',
    },
  }[accent]

  return (
    <div className="rounded-[22px] border border-white/74 bg-white/84 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.07)] backdrop-blur-[18px]">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-[14px] ${accentMap.iconBg}`}>
          {icon}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
          <div className="mt-1 text-[20px] font-semibold text-slate-700">{value}</div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{description}</p>
    </div>
  )
}

function DetailRow({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' }) {
  return (
    <div className={[
      'flex flex-col gap-1 rounded-[16px] border px-3 py-3 sm:flex-row sm:items-start sm:justify-between',
      tone === 'warning'
        ? 'border-slate-200/88 bg-orange-50/90'
        : 'border-slate-200/88 bg-slate-50/78',
    ].join(' ')}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className={[
        'max-w-[70%] break-words text-right text-[12px]',
        tone === 'warning' ? 'text-orange-900' : 'text-slate-700',
      ].join(' ')}>{value}</span>
    </div>
  )
}
