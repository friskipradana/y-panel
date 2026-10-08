import { useState, useEffect } from 'react'
import { Server } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getSystemSummary } from '@/api/system'

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}j ${minutes}m`
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
    <div className="flex-1 flex flex-col justify-between p-3 select-none gap-2">
      <div className="flex flex-col pt-0.5">
        <div
          className="font-mono text-3xl font-bold tracking-tight leading-none"
          style={{ color: 'var(--win-text)' }}
        >
          {timeString}
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          <span>{dateString}</span>
          <span className="font-mono text-[10px] opacity-75 truncate max-w-[120px]">
            {summary?.hostname || 'localhost'}
          </span>
        </div>
      </div>

      <div
        className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px]"
        style={{
          backgroundColor: 'var(--panel-surface-strong)',
          borderColor: 'var(--win-border)',
        }}
      >
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Server size={12} className="text-emerald-500" />
          <span>Uptime:</span>
        </div>
        <span className="font-mono font-semibold text-emerald-500">
          {summary?.uptimeSeconds ? formatUptime(summary.uptimeSeconds) : 'Active'}
        </span>
      </div>
    </div>
  )
}
