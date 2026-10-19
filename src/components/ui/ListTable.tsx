import type { ReactNode } from 'react'
import { ColumnMenu, type ColumnFilter, type ColumnSort } from '@/components/ui/ColumnMenu'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'

export interface ListColumn {
  label: string
  /** Names the column to the agent (the key of its sort and filter) */
  key?: string
  /** Shown instead of the label (a select-all box); the label still names it for screen readers */
  node?: ReactNode
  /** Right-aligned header over the action buttons */
  actions?: boolean
  /** Makes the header a menu that orders the rows by this column */
  sort?: ColumnSort
  /** Lets the header's menu narrow the rows to some of the column's values, like a spreadsheet */
  filter?: ColumnFilter
}

interface ListTableProps {
  /** Selects the column widths in _docker.scss */
  variant: 'containers' | 'images' | 'networks' | 'volumes' | 'templates' | 'projects' | 'dns' | 'routes' | 'files' | 'databases' | 'users' | 'users-plain' | 'docs' | 'speed' | 'widgets' | 'widgets-installed' | 'tokens' | 'hosting-orders' | 'hosting-subdomains' | 'hosting-plans' | 'hosting-vouchers' | 'hosting-domains' | 'hosting-custom-domains'
  columns: ListColumn[]
  /** No rows to head (nothing yet, still loading, or failed): the header is left out */
  empty?: boolean
  children: ReactNode
}

// Same table as the container list: a header row and flat rows on one grid
export function ListTable({ variant, columns, empty = false, children }: ListTableProps) {
  // a list that a filter has emptied keeps its header: that is where the filter is undone
  const engaged = columns.some((column) => (column.filter?.selected.length ?? 0) > 0 || !!column.sort?.direction)
  return (
    <div className={`docker-table docker-table--${variant}`}>
      {empty && !engaged ? null : (
        <div className="docker-col-header" role="row">
          {columns.map((column) => (
            <div
              key={column.label}
              className={column.actions ? 'text-right pr-1' : undefined}
              role="columnheader"
              aria-sort={column.sort ? (column.sort.direction === 'asc' ? 'ascending' : column.sort.direction === 'desc' ? 'descending' : 'none') : undefined}
            >
              {column.node ?? (column.sort || column.filter ? <ColumnMenu label={column.label} sort={column.sort} filter={column.filter} /> : column.label)}
            </div>
          ))}
        </div>
      )}
      <div className="docker-table-scroll">{children}</div>
    </div>
  )
}

// Round icon tile at the start of a row, like the one of a container
export function ListRowIcon({ children }: { children: ReactNode }) {
  return (
    <div className="docker-app-icon" aria-hidden="true">
      {children}
    </div>
  )
}

interface ListStateProps {
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
export function ListState({ loading, error, errorTitle, errorHint, loadingText, empty, emptyIcon, emptyTitle, emptyHint, children }: ListStateProps) {
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
