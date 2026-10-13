import { useEffect, useMemo, useRef, useState } from 'react'
import { FAIL_VALUE, RANGE_MS, type MetricPoint, type MetricRange } from '@/store/metricsStore'

export interface ChartSeries {
  key: string
  label: string
  /** CSS color or token, e.g. var(--panel-info-text) */
  color: string
  points: MetricPoint[]
}

export interface LineChartProps {
  series: ChartSeries[]
  range: MetricRange
  height?: number
  /** Fixed upper bound (e.g. 100 for percentages); omit for auto scale */
  yMax?: number
  /** Format a value for axis and tooltip */
  format: (value: number) => string
  /** Points further apart than this are drawn as a break (ms) */
  gapMs?: number
  /** Fill the area under the first series */
  area?: boolean
  ariaLabel: string
}

const PAD_TOP = 6
const PAD_BOTTOM = 6

function niceMax(raw: number) {
  if (raw <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * exp
}

function nearest(points: MetricPoint[], t: number): MetricPoint | null {
  if (!points.length) return null
  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].t < t) lo = mid + 1
    else hi = mid
  }
  const a = points[lo]
  const b = points[lo - 1]
  return b && Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a
}

function timeLabel(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function LineChart({ series, range, height = 70, yMax, format, gapMs = 20_000, area = true, ariaLabel }: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(250)
  const [hoverX, setHoverX] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 20) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const windowMs = RANGE_MS[range]
  const tEnd = useMemo(() => {
    let latest = 0
    for (const s of series) {
      const last = s.points[s.points.length - 1]
      if (last && last.t > latest) latest = last.t
    }
    return Math.max(latest, Date.now() - 1_000)
    // recompute whenever data changes
  }, [series])
  const tStart = tEnd - windowMs

  const visible = useMemo(
    () => series.map((s) => ({ ...s, points: s.points.filter((p) => p.t >= tStart) })),
    [series, tStart],
  )

  const top = useMemo(() => {
    if (typeof yMax === 'number') return yMax
    let max = 0
    for (const s of visible) for (const p of s.points) if (p.v > max) max = p.v
    return niceMax(max * 1.15)
  }, [visible, yMax])

  const plotH = height - PAD_TOP - PAD_BOTTOM
  const x = (t: number) => ((t - tStart) / windowMs) * width
  const y = (v: number) => PAD_TOP + plotH - (Math.min(Math.max(v, 0), top) / top) * plotH

  const paths = useMemo(() => {
    return visible.map((s) => {
      const segments: MetricPoint[][] = []
      let cur: MetricPoint[] = []
      let prevT = 0
      for (const p of s.points) {
        if (p.v === FAIL_VALUE) {
          if (cur.length) segments.push(cur)
          cur = []
          prevT = p.t
          continue
        }
        if (cur.length && p.t - prevT > gapMs) {
          segments.push(cur)
          cur = []
        }
        cur.push(p)
        prevT = p.t
      }
      if (cur.length) segments.push(cur)
      const line = segments
        .map((seg) => seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '))
        .join(' ')
      const fill = segments
        .filter((seg) => seg.length > 1)
        .map((seg) => {
          const d = seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
          return `${d} L${x(seg[seg.length - 1].t).toFixed(1)} ${height} L${x(seg[0].t).toFixed(1)} ${height} Z`
        })
        .join(' ')
      const fails = s.points.filter((p) => p.v === FAIL_VALUE)
      const last = s.points.filter((p) => p.v !== FAIL_VALUE).slice(-1)[0] ?? null
      return { key: s.key, line, fill, fails, last }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, width, top, tStart, gapMs, height])

  const hoverT = hoverX === null ? null : tStart + (hoverX / width) * windowMs
  const hover = hoverT === null
    ? null
    : visible
        .map((s) => {
          const p = nearest(s.points, hoverT)
          return p && Math.abs(p.t - hoverT) <= Math.max(gapMs, windowMs / 40) ? { s, p } : null
        })
        .filter((v): v is { s: (typeof visible)[number]; p: MetricPoint } => v !== null)

  const gradId = useMemo(() => `lc-${series.map((s) => s.key).join('-')}`, [series])
  const empty = visible.every((s) => s.points.length === 0)

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-lg border"
      style={{ height, backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        width={width}
        height={height}
        className="block"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setHoverX(Math.min(width, Math.max(0, e.clientX - rect.left)))
        }}
        onPointerLeave={() => setHoverX(null)}
      >
        <defs>
          {visible.map((s) => (
            <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={width}
            y1={PAD_TOP + plotH * f}
            y2={PAD_TOP + plotH * f}
            stroke="var(--win-border)"
            strokeDasharray="2 3"
            opacity="0.55"
          />
        ))}

        {!empty && area && paths[0]?.fill ? <path d={paths[0].fill} fill={`url(#${gradId}-${paths[0].key})`} /> : null}

        {paths.map((p, i) => (
          <g key={p.key}>
            {p.line ? (
              <path d={p.line} fill="none" stroke={visible[i].color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {p.fails.map((f) => (
              <line key={f.t} x1={x(f.t)} x2={x(f.t)} y1={PAD_TOP} y2={height - PAD_BOTTOM} stroke="var(--panel-danger-text)" strokeWidth="1.5" opacity="0.7" />
            ))}
            {p.last ? (
              <circle cx={x(p.last.t)} cy={y(p.last.v)} r="2.6" fill="var(--win-bg)" stroke={visible[i].color} strokeWidth="1.5" />
            ) : null}
          </g>
        ))}

        {hoverX !== null && hover && hover.length > 0 ? (
          <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={height - PAD_BOTTOM} stroke="var(--text-secondary)" strokeDasharray="3 3" opacity="0.7" />
        ) : null}
      </svg>

      <span className="pointer-events-none absolute left-1.5 top-0.5 font-mono text-[9px] text-[var(--text-secondary)] opacity-80">{format(top)}</span>
      <span className="pointer-events-none absolute bottom-0.5 left-1.5 font-mono text-[9px] text-[var(--text-secondary)] opacity-80">0</span>

      {empty ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] text-[var(--text-secondary)]">…</span>
      ) : null}

      {hoverX !== null && hover && hover.length > 0 ? (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-md border px-1.5 py-1 font-mono text-[10px] leading-tight shadow-md"
          style={{
            left: hoverX > width / 2 ? undefined : hoverX + 8,
            right: hoverX > width / 2 ? width - hoverX + 8 : undefined,
            backgroundColor: 'var(--menu-bg)',
            borderColor: 'var(--win-border)',
            color: 'var(--win-text)',
          }}
        >
          <div className="text-[var(--text-secondary)]">{timeLabel(hover[0].p.t)}</div>
          {hover.map(({ s, p }) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span>{s.label}</span>
              <span className="font-semibold">{p.v === FAIL_VALUE ? 'timeout' : format(p.v)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const RANGES: MetricRange[] = ['5m', '15m', '1h']

export function RangeSwitch({ value, onChange, label }: { value: MetricRange; onChange: (r: MetricRange) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: 'var(--win-border)' }}>
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={`px-1.5 py-0.5 font-mono text-[9.5px] transition-colors ${
            value === r
              ? 'bg-[var(--panel-primary-bg)] font-semibold text-[var(--panel-primary-text)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)]'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}
