import { ClipboardPaste, Copy, ZoomIn, ZoomOut } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
const KEYS: Array<{ label: string; seq: string; aria: string }> = [
  { label: 'Esc', seq: '\x1b', aria: 'Escape' },
  { label: 'Tab', seq: '\t', aria: 'Tab' },
  { label: 'Ctrl+C', seq: '\x03', aria: 'Control C' },
  { label: 'Ctrl+D', seq: '\x04', aria: 'Control D' },
  { label: '\u2191', seq: '\x1b[A', aria: 'Arrow up' },
  { label: '\u2193', seq: '\x1b[B', aria: 'Arrow down' },
  { label: '\u2190', seq: '\x1b[D', aria: 'Arrow left' },
  { label: '\u2192', seq: '\x1b[C', aria: 'Arrow right' },
  { label: '/', seq: '/', aria: 'Slash' },
  { label: '-', seq: '-', aria: 'Hyphen' },
  { label: '|', seq: '|', aria: 'Pipe' },
  { label: '~', seq: '~', aria: 'Tilde' },
]

// Phone only (the parent hides it elsewhere): keys the on-screen keyboard does not offer.
export function TerminalKeyBar({ disabled, onKey, onCopy, onPaste, onZoom }: { disabled: boolean; onKey: (sequence: string) => void; onCopy: () => void; onPaste: () => void; onZoom: (step: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="ht-keybar" role="toolbar" aria-label={t('terminal.keys')}>
      <button type="button" className="ht-keybar__key ht-keybar__key--action" aria-label={t('terminal.copy.title')} onClick={onCopy}>
        <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
        {t('terminal.copy')}
      </button>
      <button type="button" className="ht-keybar__key ht-keybar__key--action" aria-label={t('terminal.zoomOut')} onClick={() => onZoom(-1)}>
        <ZoomOut size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button type="button" className="ht-keybar__key ht-keybar__key--action" aria-label={t('terminal.zoomIn')} onClick={() => onZoom(1)}>
        <ZoomIn size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button type="button" className="ht-keybar__key ht-keybar__key--action" aria-label={t('terminal.paste')} disabled={disabled} onClick={onPaste}>
        <ClipboardPaste size={14} strokeWidth={1.75} aria-hidden="true" />
        {t('terminal.paste')}
      </button>
      {KEYS.map((key) => (
        <button key={key.aria} type="button" className="ht-keybar__key" aria-label={key.aria} disabled={disabled} onClick={() => onKey(key.seq)}>
          {key.label}
        </button>
      ))}
    </div>
  )
}
