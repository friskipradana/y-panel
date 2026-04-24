import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivitySquare, Database, HardDriveDownload, RefreshCcw, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { getDatabaseStatus, truncateDatabaseData } from '@/api/agent'
import { PanelSelectMenu } from '@/components/system/PanelSelectMenu'
import { alertLib } from '@/lib/alert'

const LOG_ROW_OPTIONS = [10, 20, 40, 80]
const TRUNCATE_DAYS = [3, 7, 14, 30, 60]
const TRUNCATE_TARGETS = [
  { label: 'Semua (Logs & Audit)', value: 'all' },
  { label: 'Runtime Logs', value: 'runtime_logs' },
  { label: 'Settings Audit', value: 'settings_audit' },
]

function MetricCard({ icon, label, value, description }: { icon: React.ReactNode; label: string; value: string; description: React.ReactNode }) {
  return (
    <article className="panel-kpi-card">
      <div className="panel-kpi-card__header">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-[12px] font-semibold">{label}</span>
        </div>
      </div>
      <div className="panel-kpi-card__value">{value}</div>
      <p className="panel-kpi-card__description">{description}</p>
    </article>
  )
}

function DetailRow({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' }) {
  return (
    <div className={`panel-muted-block rounded-[14px] px-4 py-3 ${tone === 'warning' ? 'border border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)]' : ''}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <span className="panel-section-label">{label}</span>
        <span className={`max-w-[70%] break-words text-right text-[12px] ${tone === 'warning' ? 'text-[var(--panel-warning-text)]' : 'text-[var(--win-text)]'}`}>{value}</span>
      </div>
    </div>
  )
}

export function DatabaseWindow({ authenticated }: { authenticated?: boolean }) {
  const query = useQuery({
    queryKey: ['database-status'],
    queryFn: getDatabaseStatus,
    refetchInterval: 8000,
    retry: 1,
  })

  useEffect(() => {
    if (authenticated) {
      void query.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const [logQuery, setLogQuery] = useState('')
  const [logLimit, setLogLimit] = useState(10)
  const [truncateTarget, setTruncateTarget] = useState('all')
  const [truncateDay, setTruncateDay] = useState(7)
  const [truncating, setTruncating] = useState(false)

  const handleTruncate = async () => {
    const isConfirmed = await alertLib.confirm(
      'Potong Data',
      `Anda yakin ingin menghapus arsip <b>${truncateTarget}</b> yang umurnya lebih dari <b>${truncateDay} hari</b>?<br/><br/>Operasi ini bersifat permanen dan tidak dapat dibatalkan.`,
      'Ya, Hapus',
      'Batal',
      'warning',
      'database'
    )

    if (!isConfirmed) return

    setTruncating(true)
    alertLib.showLoading('Memotong Data...', 'Proses ini mungkin memakan waktu beberapa saat tergantung ukuran database Anda.', 'database')

    try {
      const res = await truncateDatabaseData(truncateTarget, truncateDay)
      alertLib.close()
      setTimeout(() => {
        alertLib.fire('Sukses', `Berhasil memotong ${res.affected} baris data kedaluwarsa.`, 'success', 'database')
      }, 300)
      void query.refetch()
    } catch (e: any) {
      alertLib.close()
      setTimeout(() => {
        alertLib.fire('Gagal', `Gagal memotong data: ${e.response?.data?.error || e.message}`, 'error', 'database')
      }, 300)
    } finally {
      setTruncating(false)
    }
  }

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
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Database className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">Database Runtime</div>
              <div className="panel-window__meta">Status persistensi dan log MariaDB</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <div className="panel-loading">
            <RefreshCcw size={16} className="animate-spin" />
            Memuat status MariaDB runtime...
          </div>
        </div>
      </div>
    )
  }

  if (query.isError || !query.data || !status) {
    return (
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Database className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">Database Runtime</div>
              <div className="panel-window__meta">Status persistensi dan log MariaDB</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <div className="panel-error-state">
            <TriangleAlert className="h-5 w-5" />
            <div>
              <p className="font-semibold">Gagal memuat status database runtime</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">Pastikan MariaDB sudah tersedia dan env koneksi Phase 2 sudah benar.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Database className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Database Runtime</div>
            <div className="panel-window__meta">Status persistensi dan log MariaDB</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button id="database-refresh" type="button" onClick={() => void query.refetch()} className="panel-icon-btn" aria-label="Refresh database status">
            <RefreshCcw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">
              <Database className="h-3 w-3" />
              Phase 2 persistence
            </div>
            <div className="panel-hero__title">MariaDB runtime health</div>
            <p className="panel-hero__description">
              Pantau koneksi database, jumlah data persistensi, runtime log terbaru, dan jejak audit perubahan host dari backend UI Panel.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <PanelSelectMenu
                id="database-truncate-target"
                value={truncateTarget}
                onChange={setTruncateTarget}
                options={TRUNCATE_TARGETS}
                className="max-w-[220px]"
                buttonClassName="rounded-full px-3 py-2 text-[12px]"
                dropdownClassName="min-w-[220px]"
                searchable
                searchPlaceholder="Cari target..."
              />

              <PanelSelectMenu
                id="database-truncate-day"
                value={String(truncateDay)}
                onChange={(value) => setTruncateDay(Number(value))}
                options={TRUNCATE_DAYS.map((day) => ({ value: String(day), label: `> ${day} hari` }))}
                className="max-w-[140px]"
                buttonClassName="rounded-full px-3 py-2 text-[12px]"
                dropdownClassName="min-w-[140px]"
                searchable
                searchPlaceholder="Cari hari..."
              />

              <button type="button" onClick={() => void handleTruncate()} disabled={truncating} className="panel-btn panel-btn--danger rounded-full px-4 py-2 text-[12px]">
                {truncating ? 'Memotong...' : 'Potong'}
              </button>
            </div>
          </section>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <MetricCard
              icon={<ShieldCheck size={16} />}
              label="Connection"
              value={status.connected ? 'Connected' : status.enabled ? 'Unavailable' : 'Disabled'}
              description={
                status.connected ? (
                  <>
                    <span className="block">{status.user}@{status.host}:{status.port}</span>
                    <span className="block opacity-70">{status.database}</span>
                  </>
                ) : (
                  status.lastError || 'Belum ada koneksi PostgreSQL aktif.'
                )
              }
            />
            <MetricCard icon={<HardDriveDownload size={16} />} label="Runtime logs" value={String(status.runtimeLogCount)} description="Jumlah log backend yang berhasil dipersist ke MariaDB." />
            <MetricCard icon={<ActivitySquare size={16} />} label="Changelog rows" value={String(status.changelogCount)} description="Jumlah entri changelog yang tersedia dari database runtime." />
            <MetricCard icon={<Database size={16} />} label="Settings audit" value={String(status.settingsAuditCount)} description="Jumlah audit perubahan hostname/timezone/nameserver yang tercatat." />
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
            <section className="panel-shell-card p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="panel-muted-block grid h-11 w-11 place-items-center rounded-[16px] text-[var(--win-text)]">
                  <Database size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="panel-shell-card__title">Connection details</div>
                  <p className="panel-shell-card__meta">Snapshot koneksi MariaDB yang dibaca dari runtime env installer.</p>
                </div>
              </div>

              <div className="grid gap-3 text-[12px]">
                <DetailRow label="Enabled" value={status.enabled ? 'Yes' : 'No'} />
                <DetailRow label="Host" value={status.host || '-'} />
                <DetailRow label="Port" value={status.port || '-'} />
                <DetailRow label="Database" value={status.database || '-'} />
                <DetailRow label="User" value={status.user || '-'} />
                <DetailRow label="Last error" value={status.lastError || 'No recent errors'} tone={status.lastError ? 'warning' : 'normal'} />
              </div>
            </section>

            <section className="panel-shell-card flex min-h-[340px] max-h-[461px] flex-col overflow-hidden p-0">
              <div className="border-b border-[var(--win-border)] px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="panel-shell-card__title">Persisted runtime logs</div>
                  <div className="panel-shell-card__meta !mt-0">Latest {filteredRuntimeLogs.length} / {runtimeLogs.length} rows</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input
                      id="database-log-search"
                      value={logQuery}
                      onChange={(e) => setLogQuery(e.target.value)}
                      placeholder="Filter logs by service, level, message..."
                      className="panel-input h-9 pl-9 pr-3 text-[12px]"
                    />
                  </div>

                  <PanelSelectMenu
                    id="database-log-limit"
                    value={String(logLimit)}
                    onChange={(value) => setLogLimit(Number(value))}
                    options={LOG_ROW_OPTIONS.map((option) => ({ value: String(option), label: `${option} rows` }))}
                    className="max-w-[120px]"
                    buttonClassName="h-9 px-3 text-[12px] panel-input--mono"
                    dropdownClassName="min-w-[120px]"
                    searchable
                    searchPlaceholder="Cari limit..."
                  />

                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {runtimeLogs.length === 0 ? (
                  <div className="panel-empty min-h-[220px]">
                    <HardDriveDownload className="h-8 w-8" />
                    <span>Belum ada runtime log di database. Setelah MariaDB aktif, request backend akan mulai disimpan di sini.</span>
                  </div>
                ) : filteredRuntimeLogs.length === 0 ? (
                  <div className="panel-empty min-h-[220px]">
                    <Search className="h-8 w-8" />
                    <span>Tidak ada log yang cocok dengan filter saat ini.</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredRuntimeLogs.map((entry) => {
                      const isError = entry.level === 'error'
                      return (
                        <div
                          key={entry.id}
                          className={`panel-shell-card ${isError ? 'border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)]' : ''}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                            <span>{entry.service}</span>
                            <span>•</span>
                            <span>{entry.level}</span>
                            <span>•</span>
                            <span>{new Date(entry.createdAt).toLocaleString()}</span>
                          </div>
                          <div className={`mt-2 text-[13px] font-medium ${isError ? 'text-[var(--panel-danger-text)]' : 'text-[var(--win-text)]'}`}>{entry.message}</div>
                          {entry.metadata ? (
                            <pre className="panel-muted-block panel-mono mt-2 overflow-auto whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-[11px] leading-5 text-[var(--text-secondary)]">
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

          <section className="panel-shell-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="panel-shell-card__title">Recent settings audit</div>
                <p className="panel-shell-card__meta">Riwayat perubahan hostname, timezone, dan nameserver yang dikirim dari window settings.</p>
              </div>
              <div className="panel-badge panel-badge--warning">{settingsAudit.length} rows</div>
            </div>
            <div className="mt-4 flex max-h-[360px] flex-col gap-3 overflow-auto pr-1">
              {settingsAudit.length === 0 ? (
                <div className="panel-empty min-h-[140px]">
                  <ActivitySquare className="h-8 w-8" />
                  <span>Belum ada audit perubahan settings yang tersimpan.</span>
                </div>
              ) : (
                settingsAudit.map((entry) => (
                  <div key={entry.id} className="panel-muted-block rounded-[14px] px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      <span>{entry.username || 'system'}</span>
                      <span>•</span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-[12px] text-[var(--win-text)] sm:grid-cols-3">
                      <div><strong>Hostname:</strong> {entry.hostname || '-'}</div>
                      <div><strong>Timezone:</strong> {entry.timezone || '-'}</div>
                      <div><strong>Nameserver:</strong> {entry.nameservers.length > 0 ? entry.nameservers.join(', ') : '—'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {!status.connected && status.enabled ? (
            <div className="panel-error-state">
              <TriangleAlert size={15} />
              <div>
                <p className="font-semibold">MariaDB belum siap</p>
                <p className="mt-1 text-[12px] leading-6 opacity-90">Jalankan installer Linux terbaru agar MariaDB otomatis, lalu verifikasi nilai env PANEL_DB_* pada runtime service.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
