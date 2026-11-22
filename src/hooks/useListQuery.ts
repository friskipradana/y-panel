import { useCallback, useEffect, useMemo, useState } from 'react'
import { EMPTY_LIST_QUERY, type ListQuery } from '@/lib/listQuery'
import type { ListColumn } from '@/components/ui/ListTable'

const SEARCH_DELAY_MS = 250

export interface ColumnOptions {
  labelOf?: (value: string) => string
  sortable?: boolean
  filterable?: boolean
}

// What changes a query: whoever owns the state (a hook per table, or one per tab) supplies these
export interface QueryChanges {
  orderBy: (key: string, descending: boolean) => void
  clearSort: () => void
  setFilter: (column: string, values: string[]) => void
}

// The header of one column of a spreadsheet-style table
export function listColumn(query: ListQuery, change: QueryChanges, key: string, label: string, facets: Record<string, number> | undefined, options?: ColumnOptions): ListColumn {
  const sorted = query.sort === key
  return {
    label,
    key,
    sort: options?.sortable === false ? undefined : { direction: sorted ? (query.desc ? 'desc' : 'asc') : null, onOrder: (descending) => change.orderBy(key, descending), onClear: change.clearSort },
    filter:
      options?.filterable === false
        ? undefined
        : {
            options: Object.entries(facets ?? {})
              .map(([value, count]) => ({ value, label: options?.labelOf ? options.labelOf(value) : value, count }))
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })),
            selected: query.filters[key] ?? [],
            onChange: (values) => change.setFilter(key, values),
          },
  }
}

// The state of one table's search, order and column filters. Typing is applied after a short pause; the rest at once.
export function useListQuery(initial: Partial<ListQuery> = {}) {
  const [text, setText] = useState(initial.q ?? '')
  const [settled, setSettled] = useState(initial.q ?? '')
  const [sort, setSort] = useState<string | null>(initial.sort ?? null)
  const [desc, setDesc] = useState(initial.desc ?? false)
  const [filters, setFilters] = useState<Record<string, string[]>>(initial.filters ?? {})

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(text.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  const query = useMemo<ListQuery>(() => ({ ...EMPTY_LIST_QUERY, q: settled, sort, desc, filters }), [settled, sort, desc, filters])

  const orderBy = useCallback((key: string, descending: boolean) => {
    setSort(key)
    setDesc(descending)
  }, [])

  const clearSort = useCallback(() => {
    setSort(null)
    setDesc(false)
  }, [])

  const setFilter = useCallback((column: string, values: string[]) => {
    setFilters((current) => {
      const next = { ...current }
      if (values.length === 0) delete next[column]
      else next[column] = values
      return next
    })
  }, [])

  const clearFilters = useCallback(() => setFilters({}), [])

  // The spreadsheet header of one column: ordering, and filtering by what the agent says the column holds
  const column = useCallback(
    (key: string, label: string, facets: Record<string, number> | undefined, options?: ColumnOptions): ListColumn =>
      listColumn(query, { orderBy, clearSort, setFilter }, key, label, facets, options),
    [query, orderBy, clearSort, setFilter],
  )

  return { text, setText, query, sort, desc, filters, setFilter, clearFilters, column }
}

export type ListQueryState = ReturnType<typeof useListQuery>
