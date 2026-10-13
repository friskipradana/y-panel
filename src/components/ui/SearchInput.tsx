import type { ReactNode } from 'react'
import { Search } from 'lucide-react'

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  /** Dipanggil saat Enter / tombol cari ditekan */
  onSubmit?: () => void
  placeholder: string
  id?: string
  /** Tombol aksi di kanan (mis. Button "Cari") */
  action?: ReactNode
  className?: string
}

export function SearchInput({ value, onChange, onSubmit, placeholder, id, action, className = '' }: SearchInputProps) {
  return (
    <form
      role="search"
      className={`panel-search ${className}`.trim()}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="panel-search__input"
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {action}
    </form>
  )
}
