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
export function TerminalKeyBar({ disabled, onKey }: { disabled: boolean; onKey: (sequence: string) => void }) {
  const { t } = useI18n()
  return (
    <div className="ht-keybar" role="toolbar" aria-label={t('terminal.keys')}>
      {KEYS.map((key) => (
        <button key={key.aria} type="button" className="ht-keybar__key" aria-label={key.aria} disabled={disabled} onClick={() => onKey(key.seq)}>
          {key.label}
        </button>
      ))}
    </div>
  )
}
