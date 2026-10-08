import { Globe, ShieldCheck, Terminal } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getSystemSummary } from '@/api/system'

export function NetworkTrafficWidget() {
  const { data: summary } = useQuery({
    queryKey: ['system', 'summary', 'widget'],
    queryFn: getSystemSummary,
    refetchInterval: 10000,
  })

  const ipList = summary?.ipAddresses && summary.ipAddresses.length > 0
    ? summary.ipAddresses.slice(0, 3)
    : ['127.0.0.1']

  return (
    <div className="flex flex-col gap-2.5 p-3.5 select-none">
      <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-amber-500 font-semibold">
          <Globe size={12} className="text-amber-500" />
          Network & Host
        </span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono font-semibold">
          <ShieldCheck size={11} />
          ONLINE
        </span>
      </div>

      <div className="flex flex-col gap-1 rounded-lg bg-[var(--panel-surface-strong)] border border-[var(--win-border)] p-2 text-[11px]">
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <Terminal size={11} />
            Host / OS:
          </span>
          <span className="font-mono text-[var(--win-text)] font-medium truncate max-w-[140px]">
            {summary?.hostname || 'server'}
          </span>
        </div>
        <div className="text-[10px] text-[var(--text-secondary)] truncate">
          {summary?.osName || 'Linux'} ({summary?.kernel || 'kernel'})
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
          IP Interfaces
        </span>
        <div className="flex flex-col gap-1">
          {ipList.map((ip, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded bg-[var(--panel-surface-strong)] border border-[var(--win-border)] px-2 py-1 font-mono text-[11px]"
            >
              <span className="text-[var(--text-secondary)] text-[10px]">if-{idx}</span>
              <span className="text-cyan-500 font-semibold">{ip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
