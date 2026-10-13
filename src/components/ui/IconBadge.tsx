import type { ReactNode } from 'react'

export type UiTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type IconBadgeSize = 'sm' | 'md' | 'lg'

const SIZE: Record<IconBadgeSize, string> = {
  sm: 'h-7 w-7 rounded-lg text-[12px] [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-9 w-9 rounded-xl text-[13px] [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-11 w-11 rounded-2xl text-[15px] [&_svg]:h-5 [&_svg]:w-5',
}

const TONE: Record<UiTone, string> = {
  neutral:
    'border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)]',
  primary:
    'border-[color-mix(in_srgb,var(--panel-primary-text)_22%,transparent)] bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]',
  success:
    'border-[color-mix(in_srgb,var(--panel-success-text)_22%,transparent)] bg-[var(--panel-success-bg)] text-[var(--panel-success-text)]',
  warning:
    'border-[color-mix(in_srgb,var(--panel-warning-text)_22%,transparent)] bg-[var(--panel-warning-bg)] text-[var(--panel-warning-text)]',
  danger:
    'border-[color-mix(in_srgb,var(--panel-danger-text)_22%,transparent)] bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)]',
  info:
    'border-[color-mix(in_srgb,var(--panel-info-text)_22%,transparent)] bg-[var(--panel-info-bg)] text-[var(--panel-info-text)]',
}

export interface IconBadgeProps {
  /** Ikon lucide/fluent, atau teks pendek (angka langkah). Ukuran glyph diatur komponen. */
  children: ReactNode
  size?: IconBadgeSize
  tone?: UiTone
  className?: string
}

// Kotak ikon tunggal untuk seluruh UI: ukuran, radius, border, dan glyph seragam
export function IconBadge({ children, size = 'md', tone = 'neutral', className = '' }: IconBadgeProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center border font-bold leading-none [&_svg]:stroke-[1.75] ${SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
