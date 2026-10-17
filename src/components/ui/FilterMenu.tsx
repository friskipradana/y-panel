import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface FilterMenuItem {
  key: string
  label: string
  /** Shown quietly at the right, e.g. how many rows the choice has */
  count?: number
}

interface FilterMenuProps {
  /** Names the menu for screen readers */
  label: string
  items: FilterMenuItem[]
  value: string
  onChange: (key: string) => void
  id?: string
}

// A small menu of choices opened from one button: the tab switcher of a list window, or a filter
export function FilterMenu({ label, items, value, onChange, id }: FilterMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = items.find((item) => item.key === value) ?? items[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="docker-dropdown-wrap" ref={ref} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button id={id} type="button" className="docker-dropdown-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{current?.label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-75" strokeWidth={1.75} />
      </button>
      {open ? (
        <div className="docker-dropdown-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemradio"
              aria-checked={item.key === value}
              className={`docker-dropdown-item ${item.key === value ? 'docker-dropdown-item--active' : ''}`}
              onClick={() => {
                onChange(item.key)
                setOpen(false)
              }}
            >
              <span>{item.label}</span>
              {item.key === value ? <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> : item.count !== undefined ? <span className="docker-dropdown-item__count">{item.count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
