import { useEffect, useState } from 'react'
import type { Container } from '@/types'
import { STATE_STYLES } from './constants'

// ── StatusBadge ───────────────────────────────────────────────
export function StatusBadge({ state }: { state: Container['State'] }) {
  const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.dead
  return (
    <span className={`panel-badge ${stateStyle.badge}`}>
      <span className="panel-status-dot" />
      {state}
    </span>
  )
}

// ── MetaChip ──────────────────────────────────────────────────
export function MetaChip({
  label,
  value,
  tone = 'neutral',
}: {
  label?: string
  value: string
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'info'
}) {
  return (
    <span className={`docker-meta-chip docker-meta-chip--${tone}`}>
      {label ? <span className="docker-meta-chip__label">{label}</span> : null}
      <span className="docker-meta-chip__value">{value}</span>
    </span>
  )
}

// ── DeployStep ────────────────────────────────────────────────
export function DeployStep({ label, delay }: { label: string; delay: number }) {
  const [visible, setVisible] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), delay)
    const t2 = setTimeout(() => setDone(true), delay + 900)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [delay])

  if (!visible) return null

  return (
    <div className={`docker-deploy-step ${done ? 'docker-deploy-step--done' : 'docker-deploy-step--active'}`}>
      <span className="docker-deploy-step__dot">
        {done ? (
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="docker-deploy-step__check">
            <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="docker-deploy-step__pulse" />
        )}
      </span>
      <span className="docker-deploy-step__label">{label}</span>
    </div>
  )
}




