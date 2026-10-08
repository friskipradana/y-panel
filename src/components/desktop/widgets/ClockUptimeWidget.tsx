import { useState, useEffect } from 'react'
import { Clock, Server } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getSystemSummary } from '@/api/system'

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function ClockUptimeWidget() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const { data: summary } = useQuery({
    queryKey: ['system', 'summary', 'widget'],
    queryFn: getSystemSummary,
    refetchInterval: 10000,
  })

  const timeString = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const dateString = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-2 p-3.5 select-none">
      <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-cyan-400 font-semibold">
          <Clock size={12} className="text-cyan-400" />
          Server Time
        </span>
        <span className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
          {summary?.hostname || 'localhost'}
        </span>
      </div>

      <div className="flex flex-col">
        <div className="font-mono text-2xl font-bold tracking-tight text-white drop-shadow-sm">
          {timeString}
        </div>
        <div className="text-[11px] font-medium text-slate-300">
          {dateString}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800/80 px-2.5 py-1.5 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Server size={12} className="text-emerald-400" />
          <span>Uptime:</span>
        </div>
        <span className="font-mono font-semibold text-emerald-400">
          {summary?.uptimeSeconds ? formatUptime(summary.uptimeSeconds) : 'Active'}
        </span>
      </div>
    </div>
  )
}
