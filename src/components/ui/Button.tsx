import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { LoaderCircle } from 'lucide-react'

export type ButtonVariant = 'default' | 'primary' | 'primary-soft' | 'ghost' | 'outline' | 'danger' | 'danger-soft'

export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** sm 28px, md 32px (default), lg 40px */
  size?: ButtonSize
  /** Selebar wadah */
  block?: boolean
  /** Menonaktifkan tombol dan menampilkan spinner di depan label */
  loading?: boolean
  /** Ikon di depan label */
  icon?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

// Tombol teks standar: satu varian utama (primary) per area
export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  loading = false,
  icon,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const cls = ['panel-btn', variant !== 'default' ? `panel-btn--${variant}` : '', size !== 'md' ? `panel-btn--${size}` : '', block ? 'panel-btn--block' : '', className].filter(Boolean).join(' ')
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={cls}>
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
}
