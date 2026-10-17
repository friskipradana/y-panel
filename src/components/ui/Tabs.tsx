import type { ReactNode } from 'react'

export interface TabItem<K extends string> {
  key: K
  label: string
  icon?: ReactNode
  /** Angka kecil di belakang label */
  count?: number
}

export interface TabsProps<K extends string> {
  items: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** Wajib: nama daftar tab untuk pembaca layar */
  label: string
  className?: string
}

// Tab horizontal: role="tablist", panah kiri/kanan berpindah tab
export function Tabs<K extends string>({ items, value, onChange, label, className = '' }: TabsProps<K>) {
  const move = (dir: 1 | -1) => {
    const i = items.findIndex((x) => x.key === value)
    const next = items[(i + dir + items.length) % items.length]
    onChange(next.key)
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex items-center gap-1 ${className}`}
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
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
              active
                ? 'border-[var(--panel-primary-text)]/25 bg-[var(--panel-primary-bg)] font-semibold text-[var(--panel-primary-text)]'
                : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]'
            }`}
          >
            {item.icon ? <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{item.icon}</span> : null}
            {item.label}
            {item.count !== undefined ? <span className="panel-mono text-[10.5px] opacity-70">{item.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
