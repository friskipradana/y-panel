import type { ReactNode } from 'react'
import { IconBadge, type IconBadgeSize, type UiTone } from './IconBadge'

export interface SectionHeaderProps {
  icon: ReactNode
  title: string
  subtitle?: string
  tone?: UiTone
  size?: IconBadgeSize
  /** Slot kanan: tombol, badge, status */
  actions?: ReactNode
  className?: string
}

// Header seksi: ikon + judul + subjudul, rata tengah vertikal, tinggi blok teks = tinggi ikon
export function SectionHeader({
  icon,
  title,
  subtitle,
  tone = 'neutral',
  size = 'md',
  actions,
  className = 'mb-3',
}: SectionHeaderProps) {
  const minH = size === 'sm' ? 'min-h-7' : size === 'lg' ? 'min-h-11' : 'min-h-9'
  return (
    <div className={`section-header flex items-center justify-between gap-3 mobile:flex-wrap ${className}`}>
      <div className="flex min-w-0 items-center gap-3 mobile:flex-1 mobile:basis-[14rem]">
        <IconBadge size={size} tone={tone}>
          {icon}
        </IconBadge>
        <div className={`flex min-w-0 flex-col justify-center ${minH}`}>
          <div className="text-[13px] font-semibold leading-[18px] text-[var(--win-text)]">{title}</div>
          {subtitle ? (
            <div className="text-[11px] leading-[16px] text-[var(--text-secondary)]">{subtitle}</div>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
