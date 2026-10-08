import { useState, useEffect } from 'react'
import { StickyNote, Check } from 'lucide-react'

const STORAGE_KEY = 'ypanel-widget-quicknote-text'

export function QuickNoteWidget() {
  const [text, setText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || 'Catatan sysadmin:\n# Periksa container redis\n# Backup database harian'
    }
    return ''
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text)
    setSaved(true)
    const t = setTimeout(() => setSaved(false), 1200)
    return () => clearTimeout(t)
  }, [text])

  return (
    <div className="h-full flex flex-col justify-between p-3.5">
      <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)] select-none">
        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-amber-500 font-semibold">
          <StickyNote size={12} className="text-amber-500" />
          Sysadmin Memo
        </span>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono font-semibold">
            <Check size={11} /> Tersimpan
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ketik memo atau perintah di sini..."
        className="w-full flex-1 resize-none rounded-lg bg-[var(--panel-field-bg)] border border-[var(--win-border)] p-2 font-mono text-[11px] leading-relaxed text-[var(--win-text)] placeholder-[var(--text-secondary)]/60 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition-colors mt-1.5"
      />
    </div>
  )
}
