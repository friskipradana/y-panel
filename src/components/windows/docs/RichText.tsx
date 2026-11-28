import { useLayoutEffect, useRef } from 'react'
import { imageFilesOf } from '@/hooks/useImageAttachments'
import { htmlToInline, inlineToHtml } from './blocks'

const RICH_CLASS =
  'min-h-[1.5em] w-full rounded-md px-2 py-1 outline-none break-words focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] empty:before:text-[var(--text-secondary)] empty:before:content-[attr(data-placeholder)] [&_a]:text-[var(--panel-primary-text)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--panel-surface-strong)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]'

// One line of formatted text edited as it will look; the value in and out is inline Markdown
export function RichText({
  value,
  onChange,
  onEnter,
  onRemove,
  onFiles,
  placeholder,
  label,
  focusKey,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  onEnter?: () => void
  /** Backspace pressed in an empty line */
  onRemove?: () => void
  onFiles?: (files: File[]) => void
  placeholder?: string
  label: string
  focusKey: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef<string | null>(null)

  // the DOM is only rewritten for a change that did not come from typing here, so the caret stays put
  useLayoutEffect(() => {
    if (!ref.current || shown.current === value) return
    shown.current = value
    ref.current.innerHTML = inlineToHtml(value)
  }, [value])

  const emit = () => {
    const el = ref.current
    if (!el) return
    if (!el.textContent) el.innerHTML = ''
    const next = htmlToInline(el)
    shown.current = next
    onChange(next)
  }

  return (
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      data-focus-key={focusKey}
      data-placeholder={placeholder}
      className={`${RICH_CLASS} ${className}`}
      onInput={emit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (!e.nativeEvent.isComposing) onEnter?.()
        } else if (e.key === 'Backspace' && !e.currentTarget.textContent && onRemove) {
          e.preventDefault()
          onRemove()
        }
      }}
      onPaste={(e) => {
        // plain text only: pasted web formatting would not survive as Markdown
        e.preventDefault()
        const files = imageFilesOf(e.clipboardData.files)
        if (files.length > 0) {
          onFiles?.(files)
          return
        }
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s*\r?\n\s*/g, ' '))
      }}
      onClick={(e) => {
        // a link in the editor is text to edit, not a place to go
        if ((e.target as HTMLElement).closest('a')) e.preventDefault()
      }}
    />
  )
}
