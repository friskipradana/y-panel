import type { ReactNode } from 'react'
import { EmptyState, LoadingState } from './states'

export interface DataColumn<T> {
  key: string
  header: ReactNode
  /** Lebar kolom grid: '120px', 'minmax(0,2fr)'. Default 'minmax(0,1fr)' */
  width?: string
  align?: 'left' | 'right' | 'center'
  render: (row: T) => ReactNode
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  /** Wajib: nama tabel untuk pembaca layar */
  label: string
  onRowClick?: (row: T) => void
  selectedKey?: string | null
  loading?: boolean
  loadingText?: string
  emptyText?: string
  emptyIcon?: ReactNode
  className?: string
}

const ALIGN = { left: 'justify-start text-left', right: 'justify-end text-right', center: 'justify-center text-center' } as const

// Tabel data berbasis grid: header, baris hover/terpilih, state loading dan kosong bawaan
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  label,
  onRowClick,
  selectedKey,
  loading = false,
  loadingText = '',
  emptyText = '',
  emptyIcon,
  className = '',
}: DataTableProps<T>) {
  const template = columns.map((c) => c.width ?? 'minmax(0,1fr)').join(' ')

  return (
    <div role="table" aria-label={label} aria-busy={loading || undefined} className={`panel-table-container ${className}`.trim()}>
      <div
        role="row"
        className="grid items-center gap-3 border-b border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((c) => (
          <div key={c.key} role="columnheader" className={`flex min-w-0 items-center truncate ${ALIGN[c.align ?? 'left']}`}>
            {c.header}
          </div>
        ))}
      </div>

      {loading ? (
        <LoadingState className="border-none bg-transparent shadow-none">{loadingText}</LoadingState>
      ) : rows.length === 0 ? (
        <EmptyState icon={emptyIcon} className="min-h-[140px] border-none bg-transparent">
          {emptyText}
        </EmptyState>
      ) : (
        rows.map((row) => {
          const key = getRowKey(row)
          const clickable = Boolean(onRowClick)
          return (
            <div
              key={key}
              role="row"
              aria-selected={selectedKey === undefined ? undefined : selectedKey === key}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onRowClick?.(row) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick?.(row)
                      }
                    }
                  : undefined
              }
              className={`panel-table-row !grid items-center gap-3 ${clickable ? 'cursor-pointer' : ''} ${
                selectedKey === key ? 'bg-[var(--panel-primary-bg)]' : ''
              }`}
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((c) => (
                <div key={c.key} role="cell" className={`flex min-w-0 items-center text-[12.5px] text-[var(--win-text)] ${ALIGN[c.align ?? 'left']}`}>
                  {c.render(row)}
                </div>
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}
