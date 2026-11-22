import type { InputHTMLAttributes, ReactNode } from 'react'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size'> {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Teks di samping kotak; tanpa label, `aria-label` wajib */
  label?: ReactNode
  /** Keterangan kecil di bawah label */
  description?: ReactNode
  /** Warna centang: primary (default) atau warning untuk opsi berisiko */
  tone?: 'primary' | 'warning'
  indeterminate?: boolean
}

// Kotak centang standar; bagian label ikut dapat diklik
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  tone = 'primary',
  indeterminate = false,
  className = '',
  disabled,
  ...rest
}: CheckboxProps) {
  const cls = ['panel-check', tone === 'warning' ? 'panel-check--warning' : '', label ? '' : 'panel-check--bare', className]
    .filter(Boolean)
    .join(' ')
  return (
    <label className={cls}>
      <input
        {...rest}
        type="checkbox"
        className="panel-check__box"
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate && !checked
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label ? (
        <span className="panel-check__text">
          <span className="panel-check__label">{label}</span>
          {description ? <span className="panel-check__desc">{description}</span> : null}
        </span>
      ) : null}
    </label>
  )
}
