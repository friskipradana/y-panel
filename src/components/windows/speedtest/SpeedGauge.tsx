import { useState } from 'react'
import { useAnimatedNumber } from './useAnimatedNumber'

const CX = 120
const CY = 124
const R = 92
const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`
const ARC_LENGTH = Math.PI * R
const CEILINGS = [10, 50, 100, 250, 500, 1000, 2500, 10000]
const TICKS = [1, 10, 100, 1000]

const format = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1))
const tickLabel = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n))

// A point on the arc: 0 is the left end, 1 the right end
const at = (fraction: number, radius: number) => {
  const angle = Math.PI * (1 - fraction)
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) }
}

interface SpeedGaugeProps {
  /** Mbps */
  value: number
  label: string
  active: boolean
  /** Berubah saat fase berganti: skala mulai dari awal */
  scaleKey: string
  /** Warna busur: unduh memakai primary, unggah memakai info */
  tone: 'download' | 'upload'
}

// Half-circle meter on a log scale with a marker on the arc
export function SpeedGauge({ value, label, active, scaleKey, tone }: SpeedGaugeProps) {
  const shown = useAnimatedNumber(value)
  // the scale only grows while measuring, so the arc never jumps back
  const [peak, setPeak] = useState(value)
  const [seenKey, setSeenKey] = useState(scaleKey)
  const nextPeak = !active || seenKey !== scaleKey ? value : Math.max(peak, value)
  if (seenKey !== scaleKey) setSeenKey(scaleKey)
  if (nextPeak !== peak) setPeak(nextPeak)
  const ceiling = CEILINGS.find((c) => c >= nextPeak) ?? CEILINGS[CEILINGS.length - 1]

  const scale = (v: number) => Math.min(1, Math.log10(1 + v) / Math.log10(1 + ceiling))
  const progress = scale(shown)
  const marker = at(progress, R)
  const ticks = [0, ...TICKS.filter((v) => v < ceiling), ceiling]

  return (
    <div className={`speed-gauge speed-gauge--${tone}`} role="img" aria-label={`${format(value)} Mbps`}>
      <svg viewBox="0 0 240 146" className="speed-gauge__svg" aria-hidden="true">
        {ticks.map((v) => {
          const from = at(scale(v), R + 9)
          const to = at(scale(v), R + 15)
          const text = at(scale(v), R + 25)
          return (
            <g key={v}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="speed-gauge__tick-line" />
              <text x={text.x} y={text.y + 3} textAnchor="middle" className="speed-gauge__tick">
                {tickLabel(v)}
              </text>
            </g>
          )
        })}
        <path d={ARC} className="speed-gauge__track" />
        <path d={ARC} className="speed-gauge__value" strokeDasharray={ARC_LENGTH} strokeDashoffset={ARC_LENGTH * (1 - progress)} />
        {progress > 0.004 ? <circle cx={marker.x} cy={marker.y} r="8" className="speed-gauge__marker" /> : null}
      </svg>
      <div className="speed-gauge__center">
        <span className="speed-gauge__number">{format(shown)}</span>
        <span className="speed-gauge__unit">Mbps</span>
      </div>
      <span className="speed-gauge__label">{label}</span>
    </div>
  )
}
