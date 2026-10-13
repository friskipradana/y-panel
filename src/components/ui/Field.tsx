import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

// Pembungkus form: label di atas, kontrol di tengah, hint/error di bawah
export function Field({ label, htmlFor, hint, error, className = '', children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="panel-section-label">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-[11.5px] text-[var(--panel-danger-text)]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">{hint}</p>
      ) : null}
    </div>
  )
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Font mono untuk IP, port, path, token */
  mono?: boolean
  invalid?: boolean
}

export function TextInput({ mono = false, invalid = false, className = '', ...rest }: TextInputProps) {
  const cls = ['panel-input', mono ? 'panel-input--mono' : '', className].filter(Boolean).join(' ')
  return <input {...rest} aria-invalid={invalid || undefined} className={cls} />
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean
  invalid?: boolean
}

export function Textarea({ mono = false, invalid = false, className = '', ...rest }: TextareaProps) {
  const cls = ['panel-textarea', mono ? 'panel-input--mono' : '', className].filter(Boolean).join(' ')
  return <textarea {...rest} aria-invalid={invalid || undefined} className={cls} />
}
