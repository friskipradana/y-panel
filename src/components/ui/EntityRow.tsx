import type { ReactNode } from 'react'

export interface EntityRowProps {
  /** Avatar / ikon di kiri */
  leading?: ReactNode
  title: ReactNode
  /** Badge dan kontrol inline di baris judul (status, peran) */
  badges?: ReactNode
  /** Baris sekunder di bawah judul (email, image) */
  subtitle?: ReactNode
  /** Chip/info singkat di bawah subjudul */
  meta?: ReactNode
  /** Tombol aksi di kanan */
  actions?: ReactNode
  /** Paragraf penjelasan, sejajar dengan judul bila ada `leading` */
  description?: ReactNode
  /** Panel yang dibuka di bawah baris (kuota, form inline) */
  expanded?: ReactNode
  /** Sejajarkan isi ke tengah vertikal (default: atas) */
  centered?: boolean
  /** Dropdown di dalam baris boleh keluar dari batas baris */
  overflowVisible?: boolean
  className?: string
}

// Baris entitas kaya: [avatar] judul + badge, subjudul, meta | aksi, lalu deskripsi/panel
export function EntityRow({
  leading,
  title,
  badges,
  subtitle,
  meta,
  actions,
  description,
  expanded,
  centered = false,
  overflowVisible = false,
  className = '',
}: EntityRowProps) {
  return (
    <div className={`panel-table-row panel-entity-row ${overflowVisible ? 'overflow-visible' : ''} ${className}`.trim()}>
      <div className={`panel-entity-row__main ${centered ? 'panel-entity-row__main--center' : ''} ${overflowVisible ? 'overflow-visible' : ''}`.trim()}>
        {leading}
        <div className="panel-entity-row__body">
          <div className="panel-entity-row__title-line">
            <span className="panel-entity-row__title truncate">{title}</span>
            {badges}
          </div>
          {subtitle ? <div className="panel-entity-row__subtitle">{subtitle}</div> : null}
          {meta ? <div className="panel-entity-row__meta">{meta}</div> : null}
        </div>
        {actions ? <div className="panel-entity-row__actions">{actions}</div> : null}
      </div>
      {description ? <div className={leading ? 'pl-[52px]' : ''}>{description}</div> : null}
      {expanded}
    </div>
  )
}
