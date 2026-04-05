import { useMemo, useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, RefreshCcw, ScrollText, Terminal } from 'lucide-react'
import { getSystemLogs } from '@/api/agent'

const SERVICE_OPTIONS = [
  { value: 'ui-panel', label: 'ui-panel' },
  { value: 'docker', label: 'docker' },
  { value: 'mariadb', label: 'mariadb' },
  { value: 'nginx', label: 'nginx' },
  { value: 'ssh', label: 'ssh' },
]

const LIMIT_OPTIONS = [80, 160, 240, 320, 400]

function lineToneClass(line: string): string {
  if (/\[error\]|level=error|ERROR|FATAL|failed|panic/i.test(line)) return 'text-red-300'
  if (/\[warn\]|level=warn|WARN|warning/i.test(line)) return 'text-amber-300'
  if (/\[auth\]|auth|login|logout/i.test(line)) return 'text-emerald-300'
  if (/\[http\]|method=GET|method=POST|method=PUT|method=PATCH|method=DELETE/i.test(line)) return 'text-blue-300'
  if (/\[settings\]|settings/i.test(line)) return 'text-violet-300'
  return 'text-sky-100'
}

const controlClass = 'rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-mono text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-sm'

export function SystemLogsWindow() {
  const [service, setService] = useState('ui-panel')
  const [limit, setLimit] = useState(160)
  const [autoScroll, setAutoScroll] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)

  const query = useQuery({
    queryKey: ['system-logs', service, limit],
    queryFn: () => getSystemLogs(service, limit),
    refetchInterval: 5000,
    retry: 1,
  })

  const lines = useMemo(() => {
    if (!query.data?.lines?.length) return []
    return query.data.lines.map((entry) => entry.line)
  }, [query.data])

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[linear-gradient(135deg,#0f172a_0%,#1e3a5f_55%,#172554_100%)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Terminal size={15} className="text-white/85" />
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-tight text-white">System Logs</div>
              <div className="mt-px text-[10px] text-white/45">journalctl · auto-refresh 5s</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-white/45">Service</span>
              <select
                id="system-logs-service"
                value={service}
                onChange={(e) => setService(e.target.value)}
                className={controlClass}
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', color: '#e2e8f0', borderColor: 'rgba(148, 163, 184, 0.24)' }}
              >
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} style={{ backgroundColor: '#0f172a', color: '#e2e8f0' }}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-white/45">Lines</span>
              <select
                id="system-logs-limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className={controlClass}
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', color: '#e2e8f0', borderColor: 'rgba(148, 163, 184, 0.24)' }}
              >
                {LIMIT_OPTIONS.map((v) => (
                  <option key={v} value={v} style={{ backgroundColor: '#0f172a', color: '#e2e8f0' }}>{v}</option>
                ))}
              </select>
            </div>

            <button
              id="system-logs-refresh"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/15 bg-white/8 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCcw size={11} className={query.isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-slate-400/10 bg-slate-950/95 px-4 py-1.5">
          <div className="flex items-center gap-2">
            <ScrollText size={11} className="text-slate-400/60" />
            <span className="font-mono text-[11px] text-slate-300/80">{service}</span>
            {query.isFetching && (
              <>
                <Activity size={10} className="animate-pulse text-amber-400" />
                <span className="text-[10px] text-amber-400">updating...</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setAutoScroll((v) => !v)}
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-medium transition',
                autoScroll
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-slate-400/10 text-slate-400/70',
              ].join(' ')}
            >
              ↓ {autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
            </button>
            <span className="font-mono text-[10px] text-slate-500">{lines.length}/{limit}</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-scroll overflow-x-hidden bg-[linear-gradient(180deg,rgba(2,6,23,0.99),rgba(10,15,35,0.99))]">
        {query.isError ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-red-400/25 bg-red-950/30 px-5 py-4 text-center text-sm text-red-300">
              <div className="mb-2 flex items-center justify-center gap-2 font-semibold">
                <AlertTriangle size={14} />
                Gagal memuat system logs
              </div>
              <p className="text-[12px] leading-relaxed opacity-85">
                {(query.error as Error)?.message || 'Periksa service target atau izin journalctl pada host.'}
              </p>
            </div>
          </div>
        ) : query.isLoading ? (
          <div className="flex h-full items-center justify-center gap-2">
            <Activity size={13} className="animate-pulse text-slate-500" />
            <span className="font-mono text-[12px] text-slate-500">Mengambil logs dari host...</span>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-[12px] text-slate-500">Belum ada log tersedia.</span>
          </div>
        ) : (
          <div className="py-2">
            {lines.map((line, idx) => (
              <div key={idx} className="flex py-px hover:bg-white/3">
                <span className="w-11 flex-shrink-0 self-start pr-3 pt-px text-right font-mono text-[10px] leading-[1.65] text-slate-500/80 select-none">
                  {idx + 1}
                </span>
                <span className={`flex-1 break-all pr-4 font-mono text-[11px] leading-[1.65] whitespace-pre-wrap ${lineToneClass(line)}`}>
                  {line}
                </span>
              </div>
            ))}
            <div ref={logEndRef} className="h-2" />
          </div>
        )}
      </div>
    </div>
  )
}
