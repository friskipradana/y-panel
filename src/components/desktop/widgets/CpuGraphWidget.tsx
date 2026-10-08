import { useState, useEffect, useMemo } from 'react'
import { Activity, Flame, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getSystemSummary } from '@/api/system'

const MAX_POINTS = 24
const SVG_WIDTH = 250
const SVG_HEIGHT = 65

export function CpuGraphWidget() {
  const { data: summary } = useQuery({
    queryKey: ['system', 'summary', 'widget-cpu-graph'],
    queryFn: getSystemSummary,
    refetchInterval: 2500,
  })

  const currentCpu = summary?.cpuUsagePercent ?? 0

  const [history, setHistory] = useState<number[]>(() => {
    // Initial placeholder points for smooth initial look
    return Array.from({ length: MAX_POINTS }, () => Math.floor(Math.random() * 12) + 5)
  })

  useEffect(() => {
    if (typeof summary?.cpuUsagePercent === 'number') {
      const rounded = Math.min(100, Math.max(0, Number(summary.cpuUsagePercent.toFixed(1))))
      setHistory((prev) => {
        const next = [...prev.slice(1), rounded]
        return next
      })
    }
  }, [summary?.cpuUsagePercent])

  const maxCpu = useMemo(() => {
    return history.length > 0 ? Math.max(...history) : 0
  }, [history])

  const avgCpu = useMemo(() => {
    if (history.length === 0) return 0
    const sum = history.reduce((acc, v) => acc + v, 0)
    return Math.round((sum / history.length) * 10) / 10
  }, [history])

  // Generate SVG coordinates
  const { linePath, areaPath, lastPoint } = useMemo(() => {
    if (history.length < 2) return { linePath: '', areaPath: '', lastPoint: { x: 0, y: 0 } }

    const stepX = SVG_WIDTH / (history.length - 1)
    const points = history.map((val, idx) => {
      const x = Math.round(idx * stepX)
      // Clamp Y inside [4, SVG_HEIGHT - 6]
      const availableHeight = SVG_HEIGHT - 12
      const y = Math.round(SVG_HEIGHT - 6 - (val / 100) * availableHeight)
      return { x, y }
    })

    const pathCommands = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const areaCommands = `${pathCommands} L ${SVG_WIDTH} ${SVG_HEIGHT} L 0 ${SVG_HEIGHT} Z`

    return {
      linePath: pathCommands,
      areaPath: areaCommands,
      lastPoint: points[points.length - 1],
    }
  }, [history])

  return (
    <div className="flex flex-col gap-2 p-3.5 select-none">
      {/* Header */}
      <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-cyan-500 font-semibold">
          <Activity size={12} className="text-cyan-500" />
          CPU Load History
        </span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Main Stats Row */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-bold tracking-tight text-[var(--win-text)]">
            {currentCpu.toFixed(1)}%
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] uppercase">Usage</span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-secondary)]">
          <span title="Beban rata-rata">
            AVG: <strong className="font-semibold text-[var(--win-text)]">{avgCpu}%</strong>
          </span>
          <span>•</span>
          <span title="Puncak beban tertinggi">
            MAX: <strong className="font-semibold text-amber-500">{maxCpu}%</strong>
          </span>
          {typeof summary?.cpuTemp === 'number' && summary.cpuTemp > 0 && (
            <>
              <span>•</span>
              <span className="flex items-center gap-0.5 text-rose-400" title="Suhu CPU">
                <Flame size={10} />
                {Math.round(summary.cpuTemp)}°C
              </span>
            </>
          )}
        </div>
      </div>

      {/* Pure Native SVG Chart */}
      <div
        className="relative overflow-hidden rounded-lg border p-1"
        style={{
          backgroundColor: 'var(--panel-surface-strong)',
          borderColor: 'var(--win-border)',
        }}
      >
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-[65px] overflow-visible block"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="90%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1="0"
            y1={Math.round(SVG_HEIGHT * 0.25)}
            x2={SVG_WIDTH}
            y2={Math.round(SVG_HEIGHT * 0.25)}
            stroke="var(--win-border)"
            strokeDasharray="2 3"
            opacity="0.4"
          />
          <line
            x1="0"
            y1={Math.round(SVG_HEIGHT * 0.5)}
            x2={SVG_WIDTH}
            y2={Math.round(SVG_HEIGHT * 0.5)}
            stroke="var(--win-border)"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <line
            x1="0"
            y1={Math.round(SVG_HEIGHT * 0.75)}
            x2={SVG_WIDTH}
            y2={Math.round(SVG_HEIGHT * 0.75)}
            stroke="var(--win-border)"
            strokeDasharray="2 3"
            opacity="0.4"
          />

          {/* Area Fill */}
          {areaPath && <path d={areaPath} fill="url(#cpuGradient)" />}

          {/* Line Stroke */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Latest Data Point Indicator */}
          {lastPoint && (
            <>
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="3"
                fill="#06b6d4"
                className="animate-ping"
                opacity="0.5"
              />
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="2.5"
                fill="#ffffff"
                stroke="#06b6d4"
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>
      </div>

      {/* Footer timeframe & scale hint */}
      <div className="flex items-center justify-between text-[9px] font-mono text-[var(--text-secondary)] px-0.5">
        <span className="flex items-center gap-1">
          <TrendingUp size={9} />
          Realtime 60s window
        </span>
        <span>0% - 100% Scale</span>
      </div>
    </div>
  )
}
