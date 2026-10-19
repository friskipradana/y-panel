import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { agentApi } from '@/api/client'
import { useListQuery } from '@/hooks/useListQuery'
import { listParams, listQueryKey, type TableResult } from '@/lib/listQuery'
import { useI18n } from '@/lib/i18n'
import type { UiTone } from '@/components/ui/IconBadge'

export type HostingTableName = 'orders' | 'plans' | 'subdomains' | 'vouchers' | 'domains' | 'custom-domains'

// The pill of each tone: the classes the list windows share
const TONE_PILL: Record<UiTone, string> = { success: 'running', primary: 'running', warning: 'paused', info: 'paused', danger: 'dead', neutral: 'exited' }

export const indexLabel = (index: number) => String(index + 1).padStart(2, '0')

// A list of the Hosting settings as the agent sorts and filters it: the state of its search, order and column filters, and its rows
export function useHostingTable<T>(name: HostingTableName, refetchMs = 20_000) {
  const list = useListQuery()
  const query = useQuery({
    queryKey: ['hosting', name, 'table', listQueryKey(list.query)],
    queryFn: () => agentApi.get<TableResult<T>>(`/api/v1/hosting/${name}/table`, { params: listParams(list.query) }).then((r) => r.data),
    retry: 0,
    refetchInterval: refetchMs,
    placeholderData: (previous) => previous,
  })
  const items = query.data?.items ?? []
  // the list is narrowed by a search or a filter: its emptiness then says so, instead of "nothing yet"
  const narrowed = list.query.q !== '' || Object.values(list.query.filters).some((values) => values.length > 0)
  return { list, query, items, facets: query.data?.facets, all: query.data?.all ?? 0, total: query.data?.total ?? 0, narrowed }
}

// The bar over a table: its search, how many rows pass, and refresh
export function HostingTableBar({ text, setText, placeholder, total, all, fetching, onRefresh, extra }: {
  text: string
  setText: (value: string) => void
  placeholder: string
  total: number
  all: number
  fetching: boolean
  onRefresh: () => void
  extra?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="hosting-table-bar">
      <div className="docker-search-wrap">
        <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
        <input type="search" className="docker-search-input" aria-label={placeholder} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {all > 0 && total !== all ? <span className="text-[11px] text-[var(--text-secondary)]">{t('hosting.table.shown', { shown: total, all })}</span> : null}
      {extra}
      <button type="button" className="docker-icon-btn hosting-table-bar__refresh" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={onRefresh}>
        <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
      </button>
    </div>
  )
}

export function StatusPill({ tone, children }: { tone: UiTone; children: ReactNode }) {
  return (
    <span className={`docker-status-pill docker-status-pill--${TONE_PILL[tone]}`}>
      <span className="docker-status-dot" />
      <span>{children}</span>
    </span>
  )
}

// The round action button of a row, the same as in the container list
export function RowAction({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`docker-act-btn ${danger ? 'docker-act-btn--danger' : ''}`.trim()} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
