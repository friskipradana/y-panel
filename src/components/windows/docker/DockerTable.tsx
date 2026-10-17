import type { ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'

export interface DockerColumn {
  label: string
  /** Right-aligned header over the action buttons */
  actions?: boolean
}

interface DockerTableProps {
  /** Selects the column widths in _docker.scss */
  variant: 'images' | 'networks' | 'volumes' | 'templates'
  columns: DockerColumn[]
  /** No rows to head (nothing yet, still loading, or failed): the header is left out */
  empty?: boolean
  children: ReactNode
}

// Same table as the container list: a header row and flat rows on one grid
export function DockerTable({ variant, columns, empty = false, children }: DockerTableProps) {
  return (
    <div className={`docker-table docker-table--${variant}`}>
      {empty ? null : (
        <div className="docker-col-header" role="row">
          {columns.map((column) => (
            <div key={column.label} className={column.actions ? 'text-right pr-1' : undefined} role="columnheader">
              {column.label}
            </div>
          ))}
        </div>
      )}
      <div className="docker-table-scroll">{children}</div>
    </div>
  )
}

// Round icon tile at the start of a row, like the one of a container
export function DockerRowIcon({ children }: { children: ReactNode }) {
  return (
    <div className="docker-app-icon" aria-hidden="true">
      {children}
    </div>
  )
}

interface DockerListStateProps {
  loading: boolean
  error: boolean
  errorTitle: string
  errorHint?: string
  loadingText: string
  empty: boolean
  emptyIcon: ReactNode
  emptyTitle: string
  emptyHint?: string
  children: ReactNode
}

// Loading, error and empty states of a list, then the rows
export function DockerListState({ loading, error, errorTitle, errorHint, loadingText, empty, emptyIcon, emptyTitle, emptyHint, children }: DockerListStateProps) {
  if (loading) {
    return (
      <div className="p-8">
        <LoadingState>{loadingText}</LoadingState>
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-6">
        <ErrorState title={errorTitle} hint={errorHint} />
      </div>
    )
  }
  if (empty) {
    return (
      <div className="p-8">
        <EmptyState icon={emptyIcon}>
          <span className="block text-sm font-medium text-[var(--win-text)]">{emptyTitle}</span>
          {emptyHint ? <span className="mt-1 block">{emptyHint}</span> : null}
        </EmptyState>
      </div>
    )
  }
  return <>{children}</>
}
