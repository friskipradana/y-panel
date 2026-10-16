import { useState } from 'react'
import { useAnimatedNumber } from './useAnimatedNumber'

const ARC = 'M 20 110 A 90 90 0 0 1 200 110'
const ARC_LENGTH = Math.PI * 90
const CEILINGS = [10, 50, 100, 250, 500, 1000, 2500, 10000]

const format = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1))

interface SpeedGaugeProps {
  /** Mbps */
  value: number
  label: string
  active: boolean
  /** Berubah saat fase berganti: skala mulai dari awal */
  scaleKey: string
}

// Half-circle meter on a log scale
export function SpeedGauge({ value, label, active, scaleKey }: SpeedGaugeProps) {
  const shown = useAnimatedNumber(value)
  // the scale only grows while measuring, so the arc never jumps back
  const [peak, setPeak] = useState(value)
  const [seenKey, setSeenKey] = useState(scaleKey)
  const nextPeak = !active || seenKey !== scaleKey ? value : Math.max(peak, value)
  if (seenKey !== scaleKey) setSeenKey(scaleKey)
  if (nextPeak !== peak) setPeak(nextPeak)
  const ceiling = CEILINGS.find((c) => c >= nextPeak) ?? CEILINGS[CEILINGS.length - 1]

  const progress = Math.min(1, Math.log10(1 + shown) / Math.log10(1 + ceiling))

  return (
    <div className="speed-gauge" role="img" aria-label={`${format(value)} Mbps`}>
      <svg viewBox="0 0 220 128" className="speed-gauge__svg" aria-hidden="true">
        <path d={ARC} className="speed-gauge__track" />
        <path
          d={ARC}
          className={`speed-gauge__value ${active ? 'speed-gauge__value--live' : ''}`}
          strokeDasharray={ARC_LENGTH}
          strokeDashoffset={ARC_LENGTH * (1 - progress)}
        />
        <text x="20" y="126" className="speed-gauge__tick" textAnchor="start">0</text>
        <text x="200" y="126" className="speed-gauge__tick" textAnchor="end">{ceiling}</text>
      </svg>
      <div className="speed-gauge__center">
        <span className="speed-gauge__number">{format(shown)}</span>
        <span className="speed-gauge__unit">Mbps</span>
        <span className="speed-gauge__label">{label}</span>
      </div>
    </div>
  )
}
