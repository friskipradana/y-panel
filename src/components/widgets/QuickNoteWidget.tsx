import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ListChecks, Plus, Trash2 } from 'lucide-react'
import { useWidgetStore } from '@/store/widgetStore'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { NOTE_COLORS, asNoteColor, noteSwatch } from './noteColors'
import type { WidgetProps } from './types'

const LEGACY_KEY = 'ypanel-widget-quicknote-text'
const SAVE_DELAY_MS = 500
const MAX_NOTES = 50

interface Memo {
  id: string
  text: string
}

// Widgets saved before the memo list kept one text; it becomes the first memo
function legacyText() {
  try {
    return localStorage.getItem(LEGACY_KEY) ?? ''
  } catch {
    return ''
  }
}

function newId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

// The widget config only holds strings, numbers and booleans: the list is stored as JSON text
function readMemos(config: Record<string, unknown> | undefined): Memo[] {
  const raw = config?.notes
  if (typeof raw === 'string' && raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const memos = parsed
          .filter((m): m is Memo => !!m && typeof (m as Memo).id === 'string' && typeof (m as Memo).text === 'string')
          .slice(0, MAX_NOTES)
        if (memos.length > 0) return memos
      }
    } catch {
      // damaged value: fall back to the single text below
    }
  }
  const text = typeof config?.text === 'string' ? config.text : legacyText()
  return [{ id: newId(), text }]
}

const firstLine = (text: string) => text.split('\n').find((l) => l.trim())?.trim() ?? ''

// A memo widget holds a list of notes: pick one to edit, add more, delete the one you do not need.
export function QuickNoteWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const updateConfig = useWidgetStore((s) => s.updateWidgetConfig)
  const color = asNoteColor(widget.config?.color)

  const [memos, setMemos] = useState<Memo[]>(() => readMemos(widget.config))
  const [activeId, setActiveId] = useState<string>(() => {
    const stored = widget.config?.active
    const list = readMemos(widget.config)
    return typeof stored === 'string' && list.some((m) => m.id === stored) ? stored : list[0].id
  })
  const [view, setView] = useState<'edit' | 'list'>('edit')
  const pending = useRef<{ memos: Memo[]; active: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const active = useMemo(() => memos.find((m) => m.id === activeId) ?? memos[0], [memos, activeId])

  const flush = () => {
    window.clearTimeout(timer.current)
    const next = pending.current
    if (!next) return
    pending.current = null
    // `text` mirrors the active memo so older panels and the phone keep working
    const current = next.memos.find((m) => m.id === next.active)
    updateConfig(widget.id, { notes: JSON.stringify(next.memos), active: next.active, text: current?.text ?? '' })
  }

  const commit = (nextMemos: Memo[], nextActive: string, immediate = false) => {
    setMemos(nextMemos)
    setActiveId(nextActive)
    pending.current = { memos: nextMemos, active: nextActive }
    window.clearTimeout(timer.current)
    if (immediate) flush()
    else timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }

  // Persist an in-flight edit when the widget unmounts (closing, tab change)
  useEffect(() => flush, [])

  const edit = (value: string) => {
    commit(
      memos.map((m) => (m.id === active.id ? { ...m, text: value } : m)),
      active.id,
    )
  }

  const add = () => {
    if (memos.length >= MAX_NOTES) return
    const memo: Memo = { id: newId(), text: '' }
    commit([...memos, memo], memo.id, true)
    setView('edit')
  }

  const remove = async () => {
    if (active.text.trim()) {
      const ok = await alertLib.confirm(t('widget.note.deleteOneTitle'), t('widget.note.deleteOneConfirm'), t('common.delete'), t('common.cancel'))
      if (!ok) return
    }
    if (memos.length === 1) {
      commit([{ id: active.id, text: '' }], active.id, true)
      return
    }
    const rest = memos.filter((m) => m.id !== active.id)
    commit(rest, rest[0].id, true)
  }

  const iconBtn =
    'rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
      <div className="flex h-6 items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setView(view === 'list' ? 'edit' : 'list')}
          title={view === 'list' ? t('widget.note.back') : t('widget.note.showList', { count: memos.length })}
          aria-label={view === 'list' ? t('widget.note.back') : t('widget.note.showList', { count: memos.length })}
          className={`${iconBtn} flex min-w-0 items-center gap-1 text-[0.6875rem] font-semibold`}
        >
          {view === 'list' ? <ArrowLeft size={13} /> : <ListChecks size={13} />}
          <span className="truncate">
            {view === 'list' ? t('widget.note.listTitle', { count: memos.length }) : firstLine(active.text) || t('widget.note.untitled')}
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={add} disabled={memos.length >= MAX_NOTES} title={t('widget.note.new')} aria-label={t('widget.note.new')} className={iconBtn}>
            <Plus size={13} />
          </button>
          <button type="button" onClick={() => void remove()} title={t('widget.note.deleteOne')} aria-label={t('widget.note.deleteOne')} className={iconBtn}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <ul className="custom-widget-scrollbar max-h-[200px] min-h-[84px] flex-1 space-y-0.5 overflow-y-auto" aria-label={t('widget.note.listTitle', { count: memos.length })}>
          {memos.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveId(m.id)
                  pending.current = { memos, active: m.id }
                  flush()
                  setView('edit')
                }}
                aria-current={m.id === active.id ? 'true' : undefined}
                className={`block w-full truncate rounded px-1.5 py-1 text-left text-[0.8125rem] transition-colors hover:bg-[var(--panel-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] ${
                  m.id === active.id ? 'bg-[var(--panel-surface-hover)] font-semibold' : ''
                }`}
              >
                {firstLine(m.text) || <span className="text-[var(--text-secondary)]">{t('widget.note.untitled')}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <textarea
          value={active.text}
          onChange={(e) => edit(e.target.value)}
          onBlur={flush}
          spellCheck={false}
          aria-label={t('widget.note.title')}
          placeholder={t('widget.note.placeholder')}
          className="custom-widget-scrollbar min-h-[84px] w-full flex-1 resize-none bg-transparent px-1 py-0.5 text-[0.8125rem] leading-relaxed text-[var(--win-text)] placeholder:text-[var(--text-secondary)]/60 focus:outline-none"
        />
      )}

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
              className={`h-2.5 w-2.5 rounded-full border transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                color === c ? 'scale-125 ring-1 ring-[var(--win-text)]/50 ring-offset-1 ring-offset-transparent' : ''
              }`}
              style={{ backgroundColor: noteSwatch(c), borderColor: 'var(--win-border)' }}
            />
          ))}
        </div>
        <span className="text-[0.6875rem] text-[var(--text-secondary)]">{memos.length > 1 ? `${memos.findIndex((m) => m.id === active.id) + 1}/${memos.length}` : ''}</span>
      </div>
    </div>
  )
}
