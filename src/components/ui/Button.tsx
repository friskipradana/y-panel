import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

export type ButtonVariant = 'default' | 'primary' | 'primary-soft' | 'ghost' | 'danger' | 'danger-soft'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Menonaktifkan tombol dan menampilkan spinner di depan label */
  loading?: boolean
  /** Ikon di depan label */
  icon?: ReactNode
}

// Tombol teks standar: satu varian utama (primary) per area
export function Button({
  variant = 'default',
  loading = false,
  icon,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const cls = ['panel-btn', variant !== 'default' ? `panel-btn--${variant}` : '', className].filter(Boolean).join(' ')
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={cls}>
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
}
