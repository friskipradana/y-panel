import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, RefreshCcw, ScrollText } from 'lucide-react'
import { getSystemLogs } from '@/api/agent'

const SERVICE_OPTIONS = [
  { value: 'ui-panel', label: 'ui-panel' },
  { value: 'docker', label: 'docker' },
]

const LIMIT_OPTIONS = [80, 160, 240, 320]

export function SystemLogsWindow() {
  const [service, setService] = useState('ui-panel')
  const [limit, setLimit] = useState(160)

  const query = useQuery({
    queryKey: ['system-logs', service, limit],
    queryFn: () => getSystemLogs(service, limit),
    refetchInterval: 5000,
    retry: 1,
  })

  const joinedLines = useMemo(() => {
    if (!query.data?.lines?.length) return 'Belum ada log yang tersedia.'
    return query.data.lines.map((entry) => entry.line).join('\n')
  }, [query.data])

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        className="rounded-[24px] p-4 text-white"
        style={{
          background: 'linear-gradient(135deg, #111827 0%, #0f172a 45%, #172554 100%)',
          boxShadow: '0 20px 44px rgba(15,23,42,0.18)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">System logs</p>
            <h2 className="mt-2 text-[22px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[24px]">
              Runtime journal service
            </h2>
            <p className="mt-2 text-[12px] text-white/65">
              Menampilkan output journalctl terbaru langsung dari host Linux agar status service bisa dipantau tanpa buka SSH.
            </p>
          </div>

          <div className="rounded-[18px] px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Refresh</p>
            <p className="mt-1.5 text-base font-semibold leading-none">5s</p>
          </div>
        </div>
      </div>

      <div
        className="sticky top-0 z-20 rounded-[22px] border p-3.5"
        style={{
          borderColor: 'rgba(255,255,255,0.78)',
          background: 'rgba(255,255,255,0.88)',
          boxShadow: '0 14px 30px rgba(15,23,42,0.05)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--sand-500)' }}>
            Service
            <select
              id="system-logs-service"
              value={service}
              onChange={(event) => setService(event.target.value)}
              style={selectStyle}
            >
              {SERVICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--sand-500)' }}>
            Lines
            <select
              id="system-logs-limit"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              style={selectStyle}
            >
              {LIMIT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <button
            id="system-logs-refresh"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            style={refreshButtonStyle}
          >
            <RefreshCcw size={14} className={query.isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border"
        style={{
          borderColor: 'rgba(15,23,42,0.08)',
          background: 'linear-gradient(180deg, rgba(2,6,23,0.98), rgba(15,23,42,0.98))',
          boxShadow: '0 22px 40px rgba(2,6,23,0.22)',
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'rgba(148,163,184,0.16)' }}>
          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-200">
            <ScrollText size={14} />
            {query.data?.service ?? service}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {query.isFetching ? <Activity size={13} className="animate-pulse" /> : null}
            {query.isFetching ? 'Updating logs...' : `Showing up to ${limit} lines`}
          </div>
        </div>

        {query.isError ? (
          <div className="flex flex-1 items-center justify-center px-5 text-center">
            <div className="max-w-md rounded-[20px] border px-4 py-4 text-sm" style={{ borderColor: 'rgba(248,113,113,0.24)', background: 'rgba(127,29,29,0.18)', color: '#fecaca' }}>
              <div className="mb-2 flex items-center justify-center gap-2 font-semibold">
                <AlertTriangle size={16} />
                Gagal memuat system logs
              </div>
              <p className="leading-relaxed opacity-90">
                {(query.error as Error)?.message || 'Periksa service target atau izin journalctl pada host.'}
              </p>
            </div>
          </div>
        ) : (
          <pre
            id="system-logs-output"
            className="min-h-0 flex-1 overflow-auto px-4 py-4 text-[12px] leading-6"
            style={{
              margin: 0,
              color: '#dbeafe',
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {query.isLoading ? 'Mengambil system logs dari host...' : joinedLines}
          </pre>
        )}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(203,213,225,0.95)',
  background: 'rgba(255,255,255,0.94)',
  color: '#0f172a',
  padding: '6px 10px',
  fontSize: 12,
  outline: 'none',
}

const refreshButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 34,
  borderRadius: 999,
  border: '1px solid rgba(203,213,225,0.95)',
  background: 'rgba(255,255,255,0.94)',
  color: '#0f172a',
  padding: '0 14px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
}
