import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type IconButtonTone = 'default' | 'primary' | 'success' | 'warning' | 'danger'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Wajib: dipakai sebagai aria-label dan tooltip */
  label: string
  tone?: IconButtonTone
  children: ReactNode
}

// Tombol hanya-ikon; label wajib agar bisa dibaca pembaca layar
export function IconButton({ label, tone = 'default', className = '', type = 'button', children, ...rest }: IconButtonProps) {
  const cls = ['panel-icon-btn', tone !== 'default' ? `panel-icon-btn--${tone}` : '', className].filter(Boolean).join(' ')
  return (
    <button {...rest} type={type} aria-label={label} title={rest.title ?? label} className={cls}>
      {children}
    </button>
  )
}
