import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useWidgetStore } from '@/store/widgetStore'
import { useI18n } from '@/lib/i18n'
import { NOTE_COLORS, asNoteColor, noteSwatch } from './noteColors'
import type { WidgetProps } from './types'

const LEGACY_KEY = 'ypanel-widget-quicknote-text'
const SAVE_DELAY_MS = 500

// Notes created before multi-note support kept a single text in localStorage
function legacyText() {
  try {
    return localStorage.getItem(LEGACY_KEY) ?? ''
  } catch {
    return ''
  }
}

export function QuickNoteWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const updateConfig = useWidgetStore((s) => s.updateWidgetConfig)
  const addWidget = useWidgetStore((s) => s.addWidget)
  const color = asNoteColor(widget.config?.color)

  const [text, setText] = useState(() =>
    typeof widget.config?.text === 'string' ? widget.config.text : legacyText(),
  )
  const pending = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = () => {
    window.clearTimeout(timer.current)
    if (pending.current !== null) {
      updateConfig(widget.id, { text: pending.current })
      pending.current = null
    }
  }

  const onChange = (value: string) => {
    setText(value)
    pending.current = value
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }

  // Persist an in-flight edit when the note unmounts (closing, tab change)
  useEffect(() => flush, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        spellCheck={false}
        aria-label={t('widget.note.title')}
        placeholder={t('widget.note.placeholder')}
        className="custom-widget-scrollbar min-h-[84px] w-full flex-1 resize-none bg-transparent px-1 py-0.5 text-[0.8125rem] leading-relaxed text-[var(--win-text)] placeholder:text-[var(--text-secondary)]/60 focus:outline-none"
      />
      <div className="flex h-5 items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <div role="group" aria-label={t('widget.note.color')} className="flex items-center gap-1.5">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              aria-label={c}
              title={c}
              onClick={() => updateConfig(widget.id, { color: c })}
              className={`h-3.5 w-3.5 rounded-full border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                color === c ? 'ring-2 ring-[var(--win-text)]/40' : ''
              }`}
              style={{ backgroundColor: noteSwatch(c), borderColor: 'var(--win-border)' }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--text-secondary)]">
          <span>{text.length}</span>
          <button
            type="button"
            onClick={() => addWidget('quick-note')}
            title={t('widget.note.new')}
            aria-label={t('widget.note.new')}
            className="rounded p-0.5 transition-colors hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
