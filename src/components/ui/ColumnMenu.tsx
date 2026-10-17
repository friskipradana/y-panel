import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowDownAZ, ArrowUp, ArrowUpAZ, Check, ChevronDown, Filter } from 'lucide-react'
import { Checkbox } from '@/components/ui/Checkbox'
import { useI18n } from '@/lib/i18n'

export interface ColumnSort {
  direction: 'asc' | 'desc' | null
  /** Order the rows by this column, ascending or descending */
  onOrder: (descending: boolean) => void
  onClear: () => void
}

export interface ColumnFilterOption {
  value: string
  label: string
  count: number
}

export interface ColumnFilter {
  /** The values the agent says the column holds, counted over the rows the other columns leave */
  options: ColumnFilterOption[]
  /** The values the column is narrowed to; empty means everything */
  selected: string[]
  onChange: (values: string[]) => void
}

interface ColumnMenuProps {
  label: string
  sort?: ColumnSort
  filter?: ColumnFilter
}

const SEARCH_FROM = 8

// The header of a spreadsheet column: press it for the menu that orders the rows by it and narrows it to some of its values
export function ColumnMenu({ label, sort, filter }: ColumnMenuProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const narrowed = !!filter && filter.selected.length > 0
  const ordered = sort?.direction ?? null

  // drawn on the page, so no table or window clips it; kept inside the screen
  const place = useCallback(() => {
    const el = buttonRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.min(272, window.innerWidth - 16)
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    setPanelStyle({ position: 'fixed', top: rect.bottom + 4, left, width, maxHeight: Math.max(200, window.innerHeight - rect.bottom - 16) })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const options = filter?.options ?? []
  const needle = search.trim().toLowerCase()
  const visible = useMemo(() => (needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options), [options, needle])

  const toggle = (value: string) => {
    if (!filter) return
    const all = options.map((o) => o.value)
    const current = new Set(filter.selected.length > 0 ? filter.selected : all)
    if (current.has(value)) current.delete(value)
    else current.add(value)
    // everything ticked, or nothing left: no filter at all
    filter.onChange(current.size === all.length || current.size === 0 ? [] : [...current])
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`column-head${ordered || narrowed ? ' column-head--on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('table.columnMenu', { column: label })}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        {ordered === 'asc' ? <ArrowUp size={12} strokeWidth={1.75} aria-hidden="true" /> : ordered === 'desc' ? <ArrowDown size={12} strokeWidth={1.75} aria-hidden="true" /> : null}
        {narrowed ? <Filter size={11} strokeWidth={1.75} fill="currentColor" aria-label={t('table.filtered')} /> : null}
        <ChevronDown size={12} strokeWidth={1.75} className="column-head__chevron" aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div ref={panelRef} role="dialog" aria-label={t('table.columnMenu', { column: label })} className="column-menu" style={panelStyle} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
              {sort ? (
                <div className="column-menu__group">
                  <button type="button" className={`column-menu__action${ordered === 'asc' ? ' column-menu__action--on' : ''}`} onClick={() => sort.onOrder(false)}>
                    <ArrowUpAZ size={14} strokeWidth={1.75} />
                    <span>{t('table.sortAsc')}</span>
                    {ordered === 'asc' ? <Check size={13} strokeWidth={1.75} className="ml-auto" /> : null}
                  </button>
                  <button type="button" className={`column-menu__action${ordered === 'desc' ? ' column-menu__action--on' : ''}`} onClick={() => sort.onOrder(true)}>
                    <ArrowDownAZ size={14} strokeWidth={1.75} />
                    <span>{t('table.sortDesc')}</span>
                    {ordered === 'desc' ? <Check size={13} strokeWidth={1.75} className="ml-auto" /> : null}
                  </button>
                  {ordered ? (
                    <button type="button" className="column-menu__action" onClick={sort.onClear}>
                      <span>{t('table.clearSort')}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}

              {filter ? (
                <div className="column-menu__group column-menu__group--filter">
                  {options.length > SEARCH_FROM ? (
                    <input autoFocus type="search" className="column-menu__search" value={search} placeholder={t('table.searchValues')} aria-label={t('table.searchValues')} onChange={(e) => setSearch(e.target.value)} />
                  ) : null}
                  <div className="column-menu__bulk">
                    <button type="button" onClick={() => filter.onChange(needle ? visible.map((o) => o.value) : [])} disabled={visible.length === 0}>
                      {needle ? t('table.onlyResults') : t('table.selectAll')}
                    </button>
                    <button type="button" onClick={() => filter.onChange([])} disabled={!narrowed}>
                      {t('table.clearFilter')}
                    </button>
                  </div>
                  <div className="column-menu__list">
                    {visible.length === 0 ? <p className="column-menu__empty">{t('table.noValues')}</p> : null}
                    {visible.map((option) => (
                      <div key={option.value} className="column-menu__item">
                        <Checkbox
                          checked={filter.selected.length === 0 || filter.selected.includes(option.value)}
                          onChange={() => toggle(option.value)}
                          label={
                            <span className="column-menu__label">
                              <span className="truncate" title={option.label}>{option.label || '-'}</span>
                              <span className="column-menu__count">{option.count}</span>
                            </span>
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
