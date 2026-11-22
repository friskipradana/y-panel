import { useEffect } from 'react'
import { ListChecks, Plus, Trash2, X } from 'lucide-react'
import { MAX_NOTES, useNoteListStore, useWidgetStore } from '@/store/widgetStore'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { NOTE_COLORS, asNoteColor, noteSwatch } from './noteColors'
import type { WidgetProps } from './types'

const firstLine = (text: string) => text.split('\n').find((l) => l.trim())?.trim() ?? ''

const headerBtn =
  'grid cursor-pointer place-items-center rounded-md transition-colors hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40'

// The list and new-note buttons of a sticky note, placed in the header of its widget (desktop hover header, phone widget bar)
export function NoteHeaderActions({ widgetId, large = false }: { widgetId: string; large?: boolean }) {
  const { t } = useI18n()
  const count = useWidgetStore((s) => s.notes.length)
  const newStickyNote = useWidgetStore((s) => s.newStickyNote)
  const listOpen = useNoteListStore((s) => s.openFor === widgetId)
  const setOpenFor = useNoteListStore((s) => s.setOpenFor)
  const box = large ? 'h-8 w-8' : 'h-6 w-6'
  const icon = large ? 16 : 12
  const listLabel = listOpen ? t('widget.note.back') : t('widget.note.showList', { count })
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpenFor(listOpen ? null : widgetId)
        }}
        title={listLabel}
        aria-label={listLabel}
        aria-pressed={listOpen}
        className={`${headerBtn} ${box}`}
      >
        <ListChecks size={icon} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          newStickyNote()
        }}
        disabled={count >= MAX_NOTES}
        title={t('widget.note.new')}
        aria-label={t('widget.note.new')}
        className={`${headerBtn} ${box}`}
      >
        <Plus size={icon} />
      </button>
    </>
  )
}

// One sticky note per widget. The list (opened from the header) shows every note: pick one to put it on the desktop as its own widget.
export function QuickNoteWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const noteId = String(widget.config?.noteId ?? '')
  const notes = useWidgetStore((s) => s.notes)
  const note = notes.find((n) => n.id === noteId)
  const updateNote = useWidgetStore((s) => s.updateNote)
  const deleteNote = useWidgetStore((s) => s.deleteNote)
  const openNote = useWidgetStore((s) => s.openNote)
  const listOpen = useNoteListStore((s) => s.openFor === widget.id)
  const setOpenFor = useNoteListStore((s) => s.setOpenFor)
  const color = asNoteColor(note?.color)

  // A list left open in a widget that goes away must not stay open for the next one with the same id
  useEffect(
    () => () => {
      if (useNoteListStore.getState().openFor === widget.id) useNoteListStore.getState().setOpenFor(null)
    },
    [widget.id],
  )

  const open = (id: string) => {
    if (id !== noteId) openNote(id)
    setOpenFor(null)
  }

  const remove = async (id: string, body: string) => {
    if (body.trim()) {
      const ok = await alertLib.confirm(t('widget.note.deleteOneTitle'), t('widget.note.deleteOneConfirm'), t('common.delete'), t('common.cancel'))
      if (!ok) return
    }
    deleteNote(id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
      {listOpen ? (
        <ul className="custom-widget-scrollbar max-h-[200px] min-h-[84px] flex-1 space-y-0.5 overflow-y-auto" aria-label={t('widget.note.listTitle', { count: notes.length })}>
          {notes.map((n) => (
            <li key={n.id} className="group/row flex items-center gap-1">
              <button
                type="button"
                onClick={() => open(n.id)}
                aria-current={n.id === noteId ? 'true' : undefined}
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[0.8125rem] transition-colors hover:bg-[var(--panel-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] ${
                  n.id === noteId ? 'bg-[var(--panel-surface-hover)] font-semibold' : ''
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full border" style={{ backgroundColor: noteSwatch(asNoteColor(n.color)), borderColor: 'var(--win-border)' }} />
                <span className="truncate">{firstLine(n.text) || <span className="text-[var(--text-secondary)]">{t('widget.note.untitled')}</span>}</span>
              </button>
              <button
                type="button"
                onClick={() => void remove(n.id, n.text)}
                title={t('widget.note.deleteOne')}
                aria-label={t('widget.note.deleteOne')}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-danger-bg)] hover:text-[var(--panel-danger-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
          {notes.length === 0 ? <li className="px-1.5 py-1 text-[0.8125rem] text-[var(--text-secondary)]">{t('widget.note.untitled')}</li> : null}
        </ul>
      ) : (
        <textarea
          value={note?.text ?? ''}
          onChange={(e) => updateNote(noteId, { text: e.target.value })}
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
              onClick={() => updateNote(noteId, { color: c })}
              className={`h-2.5 w-2.5 rounded-full border transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                color === c ? 'scale-125 ring-1 ring-[var(--win-text)]/50 ring-offset-1 ring-offset-transparent' : ''
              }`}
              style={{ backgroundColor: noteSwatch(c), borderColor: 'var(--win-border)' }}
            />
          ))}
        </div>
        {listOpen ? (
          <button type="button" onClick={() => setOpenFor(null)} className="flex items-center gap-0.5 text-[0.6875rem] text-[var(--text-secondary)] hover:text-[var(--win-text)]">
            <X size={11} />
            {t('widget.note.back')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
