import type { ReactNode } from 'react'

export interface SelectableCardProps {
  selected: boolean
  onClick: () => void
  /** Layout isi kartu saja (flex, gap, padding, radius); status terpilih diatur komponen */
  className?: string
  children: ReactNode
}

// Pilihan tunggal berbentuk kartu: aria-pressed + ring terpilih dari token
export function SelectableCard({ selected, onClick, className = '', children }: SelectableCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`${className} cursor-pointer border transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
        selected
          ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30'
          : 'border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]'
      }`}
    >
      {children}
    </button>
  )
}
