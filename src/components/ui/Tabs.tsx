import type { ReactNode } from 'react'

export interface TabItem<K extends string> {
  key: K
  label: string
  icon?: ReactNode
  /** Angka kecil di belakang label */
  count?: number
}

export type TabsVariant = 'pills' | 'segmented'

export interface TabsProps<K extends string> {
  items: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** Wajib: nama daftar tab untuk pembaca layar */
  label: string
  variant?: TabsVariant
  className?: string
}

// Tab horizontal: role="tablist", panah kiri/kanan berpindah tab
export function Tabs<K extends string>({ items, value, onChange, label, variant = 'pills', className = '' }: TabsProps<K>) {
  const move = (dir: 1 | -1) => {
    const i = items.findIndex((x) => x.key === value)
    const next = items[(i + dir + items.length) % items.length]
    onChange(next.key)
  }
  const listCls = ['panel-tabs', variant === 'segmented' ? 'panel-tabs--segmented' : '', className].filter(Boolean).join(' ')
  return (
    <div
      role="tablist"
      aria-label={label}
      className={listCls}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') move(1)
        if (e.key === 'ArrowLeft') move(-1)
      }}
    >
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.key)}
            className={`panel-tab ${active ? 'panel-tab--active' : ''}`.trim()}
          >
            {item.icon ? item.icon : null}
            {item.label}
            {item.count !== undefined ? <span className="panel-tab__count">{item.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
