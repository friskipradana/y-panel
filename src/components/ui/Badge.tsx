import type { ReactNode } from 'react'
import type { UiTone } from './IconBadge'

export interface BadgeProps {
  tone?: UiTone
  /** Titik status di depan label */
  dot?: boolean
  className?: string
  children: ReactNode
}

// Label status pendek; warna menandakan arti, bukan dekorasi
export function Badge({ tone = 'neutral', dot = false, className = '', children }: BadgeProps) {
  return (
    <span className={`panel-badge panel-badge--${tone} ${className}`.trim()}>
      {dot ? <span className="panel-status-dot" /> : null}
      {children}
    </span>
  )
}
