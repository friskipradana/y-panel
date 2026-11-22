import type { ReactNode } from 'react'

export interface ListRowProps {
  title: ReactNode
  /** Badge/tag kecil di samping judul */
  tag?: ReactNode
  /** Tombol aksi di kanan atas (IconButton/Button) */
  actions?: ReactNode
  /** Detail meta di bawah judul; pisahkan baris dengan <br /> */
  details?: ReactNode
  className?: string
}

// Baris daftar dua tingkat: judul + tag + aksi, lalu detail meta
export function ListRow({ title, tag, actions, details, className = '' }: ListRowProps) {
  return (
    <div className={`panel-table-row ${className}`.trim()}>
      <div className="row-top">
        <div className="panel-list-row__info">
          <span className="panel-list-row__name">{title}</span>
          {tag}
        </div>
        {actions ? <div className="panel-list-row__actions">{actions}</div> : null}
      </div>
      {details ? (
        <div className="panel-list-row__desc">
          <span className="panel-badge panel-badge--detail">{details}</span>
        </div>
      ) : null}
    </div>
  )
}
