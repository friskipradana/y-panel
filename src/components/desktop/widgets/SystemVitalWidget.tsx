import { Cpu, HardDrive, MemoryStick } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getSystemSummary } from '@/api/system'

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function SystemVitalWidget() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['system', 'summary', 'widget'],
    queryFn: getSystemSummary,
    refetchInterval: 5000,
  })

  const cpuPercent = summary?.cpuUsagePercent ?? 0
  const ramTotal = summary?.memory?.total ?? 1
  const ramUsed = summary?.memory?.used ?? 0
  const ramPercent = ramTotal > 0 ? Math.min(100, Math.round((ramUsed / ramTotal) * 100)) : 0

  const diskTotal = summary?.storage?.total ?? 1
  const diskUsed = summary?.storage?.used ?? 0
  const diskPercent = diskTotal > 0 ? Math.min(100, Math.round((diskUsed / diskTotal) * 100)) : 0

  return (
    <div className="flex flex-col gap-2.5 p-3.5 select-none">
      <div className="flex items-center justify-between text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-indigo-500 font-semibold">
          <Cpu size={12} className="text-indigo-500" />
          System Vitals
        </span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* CPU */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--win-text)' }}>
            <Cpu size={11} className="text-cyan-500" />
            CPU
          </span>
          <span className="font-mono font-semibold text-cyan-500">
            {isLoading ? '...' : `${cpuPercent.toFixed(1)}%`}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--panel-surface-strong)' }}
        >
          <div
            className="h-full rounded-full bg-cyan-500 transition-all duration-500"
            style={{ width: `${Math.min(100, cpuPercent)}%` }}
          />
        </div>
      </div>

      {/* Memory */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--win-text)' }}>
            <MemoryStick size={11} className="text-emerald-500" />
            RAM
          </span>
          <span className="font-mono font-semibold text-emerald-500">
            {isLoading ? '...' : `${ramPercent}%`}
            <span className="ml-1 text-[9px] font-normal" style={{ color: 'var(--text-secondary)' }}>
              ({formatBytes(ramUsed)})
            </span>
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--panel-surface-strong)' }}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${ramPercent}%` }}
          />
        </div>
      </div>

      {/* Storage */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--win-text)' }}>
            <HardDrive size={11} className="text-violet-500" />
            Disk
          </span>
          <span className="font-mono font-semibold text-violet-500">
            {isLoading ? '...' : `${diskPercent}%`}
            <span className="ml-1 text-[9px] font-normal" style={{ color: 'var(--text-secondary)' }}>
              ({formatBytes(diskUsed)})
            </span>
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--panel-surface-strong)' }}
        >
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-500"
            style={{ width: `${diskPercent}%` }}
          />
        </div>
      </div>
    </div>
  )
}
