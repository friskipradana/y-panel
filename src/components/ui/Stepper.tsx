import { Check } from 'lucide-react'

export interface StepperItem<K extends string | number> {
  key: K
  label: string
}

export interface StepperProps<K extends string | number> {
  items: StepperItem<K>[]
  value: K
  /** Dipanggil saat langkah dipilih; langkah yang tidak boleh dibuka lewat `canSelect` */
  onChange: (key: K) => void
  /** Tanpa ini semua langkah boleh dibuka; dengan ini hanya yang mengembalikan true */
  canSelect?: (key: K, index: number) => boolean
  label: string
  className?: string
}

// Langkah berurutan: yang sudah lewat bercentang, yang aktif menyala; di layar sempit hanya nama langkah aktif yang tampil
export function Stepper<K extends string | number>({ items, value, onChange, canSelect, label, className = '' }: StepperProps<K>) {
  const currentIndex = items.findIndex((item) => item.key === value)
  return (
    <ol className={`flex items-center gap-1 overflow-x-auto ${className}`.trim()} aria-label={label}>
      {items.map((item, index) => {
        const done = index < currentIndex
        const current = index === currentIndex
        const selectable = canSelect ? canSelect(item.key, index) : true
        return (
          <li key={String(item.key)} className="flex items-center gap-1">
            {index > 0 ? <span className="h-px w-3 bg-[var(--win-border)] sm:w-8" aria-hidden="true" /> : null}
            <button
              type="button"
              aria-current={current ? 'step' : undefined}
              disabled={!selectable}
              onClick={() => onChange(item.key)}
              className={`flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-default ${
                selectable && !current ? 'cursor-pointer' : ''
              } ${
                current
                  ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]'
                  : selectable
                    ? 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]'
                    : 'border-transparent text-[var(--text-muted)]'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10.5px] font-semibold ${
                  current || done ? 'border-[var(--panel-primary-solid)] text-[var(--panel-primary-text)]' : 'border-[var(--win-border)]'
                }`}
              >
                {done ? <Check size={11} aria-hidden="true" /> : index + 1}
              </span>
              <span className={current ? '' : 'hidden sm:inline'}>{item.label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
