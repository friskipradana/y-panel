import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

export type IconButtonTone = 'default' | 'primary' | 'success' | 'warning' | 'danger'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Wajib: dipakai sebagai aria-label dan tooltip */
  label: string
  tone?: IconButtonTone
  loading?: boolean
  children: ReactNode
}

// Tombol hanya-ikon; label wajib agar bisa dibaca pembaca layar
export function IconButton({
  label,
  tone = 'default',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  const cls = ['panel-icon-btn', tone !== 'default' ? `panel-icon-btn--${tone}` : '', className].filter(Boolean).join(' ')
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={label}
      title={rest.title ?? label}
      className={cls}
    >
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : children}
    </button>
  )
}
