// What a table asks of the agent: a search, one column to order by, and for any column the values it is narrowed to.
// The agent applies it to the whole list and answers with the rows and what each column can be narrowed to.

export interface ListQuery {
  q: string
  sort: string | null
  desc: boolean
  /** column -> the values it is narrowed to; a column without an entry (or with none) shows everything */
  filters: Record<string, string[]>
}

export const EMPTY_LIST_QUERY: ListQuery = { q: '', sort: null, desc: false, filters: {} }

// How a list endpoint answers
export interface TableResult<T> {
  items: T[]
  /** Rows that pass the search and every filter; All is how many there were before */
  total: number
  all: number
  /** column -> value -> count, over the rows the other columns' filters leave */
  facets: Record<string, Record<string, number>>
}

// The query as URL parameters: q, sort, order, and one f.<column> per value (repeated)
export function listParams(query: ListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.sort) {
    params.set('sort', query.sort)
    params.set('order', query.desc ? 'desc' : 'asc')
  }
  for (const [column, values] of Object.entries(query.filters)) {
    for (const value of values) params.append(`f.${column}`, value)
  }
  return params
}

// A stable text of a query, for a cache key
export const listQueryKey = (query: ListQuery) => listParams(query).toString()

export const activeFilterCount = (query: ListQuery) => Object.values(query.filters).filter((values) => values.length > 0).length
