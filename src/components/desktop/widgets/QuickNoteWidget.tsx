import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'

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
    <div className="flex-1 flex flex-col p-2.5 gap-1.5 h-full min-h-0">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ketik memo atau perintah di sini..."
        className="w-full flex-1 min-h-[95px] resize-none rounded-lg bg-[var(--panel-field-bg)] border border-[var(--win-border)] p-2 font-mono text-[11px] leading-relaxed text-[var(--win-text)] placeholder-[var(--text-secondary)]/50 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition-colors custom-widget-scrollbar"
      />
      <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] px-0.5 font-mono select-none">
        <span className="opacity-75">Auto-saved</span>
        {saved && (
          <span className="flex items-center gap-1 text-emerald-500 font-semibold transition-opacity">
            <Check size={10} /> Tersimpan
          </span>
        )}
      </div>
    </div>
  )
}
