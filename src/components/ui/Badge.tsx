import type { ReactNode } from 'react'
import type { UiTone } from './IconBadge'

export interface BadgeProps {
  tone?: UiTone
  /** Titik status di depan label */
  dot?: boolean
  className?: string
  /** Bila diisi, badge menjadi tombol (mis. ubah role) */
  onClick?: () => void
  title?: string
  children: ReactNode
}

// Label status pendek; warna menandakan arti, bukan dekorasi
export function Badge({ tone = 'neutral', dot = false, className = '', onClick, title, children }: BadgeProps) {
  const cls = `panel-badge panel-badge--${tone} ${onClick ? 'panel-badge--action' : ''} ${className}`.trim()
  const content = (
    <>
      {dot ? <span className="panel-status-dot" /> : null}
      {children}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title}>
        {content}
      </button>
    )
  }
  return (
    <span className={cls} title={title}>
      {content}
    </span>
  )
}
