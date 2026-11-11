import { useState } from 'react'
import { ClipboardPaste, Copy, ZoomIn, ZoomOut } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface KeyItem {
  label: string
  seq: string
  aria: string
}

const NAV_KEYS: KeyItem[] = [
  { label: 'Esc', seq: '\x1b', aria: 'Escape' },
  { label: 'Tab', seq: '\t', aria: 'Tab' },
  { label: '\u2191', seq: '\x1b[A', aria: 'Arrow up' },
  { label: '\u2193', seq: '\x1b[B', aria: 'Arrow down' },
  { label: '\u2190', seq: '\x1b[D', aria: 'Arrow left' },
  { label: '\u2192', seq: '\x1b[C', aria: 'Arrow right' },
  { label: 'Home', seq: '\x1b[H', aria: 'Home' },
  { label: 'End', seq: '\x1b[F', aria: 'End' },
  { label: 'PgUp', seq: '\x1b[5~', aria: 'Page Up' },
  { label: 'PgDn', seq: '\x1b[6~', aria: 'Page Down' },
]

const CTRL_KEYS: KeyItem[] = [
  { label: 'Ctrl+C', seq: '\x03', aria: 'Control C (Interrupt)' },
  { label: 'Ctrl+D', seq: '\x04', aria: 'Control D (EOF)' },
  { label: 'Ctrl+Z', seq: '\x1a', aria: 'Control Z (Suspend)' },
  { label: 'Ctrl+L', seq: '\x0c', aria: 'Control L (Clear)' },
  { label: 'Ctrl+A', seq: '\x01', aria: 'Control A (Line start)' },
  { label: 'Ctrl+E', seq: '\x05', aria: 'Control E (Line end)' },
  { label: 'Ctrl+U', seq: '\x15', aria: 'Control U (Cut line)' },
  { label: 'Ctrl+K', seq: '\x0b', aria: 'Control K (Cut to end)' },
  { label: 'Ctrl+W', seq: '\x17', aria: 'Control W (Cut word)' },
  { label: 'Ctrl+R', seq: '\x12', aria: 'Control R (History search)' },
]

const SYMBOL_KEYS: KeyItem[] = [
  { label: '/', seq: '/', aria: 'Slash' },
  { label: '-', seq: '-', aria: 'Hyphen' },
  { label: '_', seq: '_', aria: 'Underscore' },
  { label: '|', seq: '|', aria: 'Pipe' },
  { label: '~', seq: '~', aria: 'Tilde' },
  { label: '\\', seq: '\\', aria: 'Backslash' },
  { label: '$', seq: '$', aria: 'Dollar' },
  { label: '@', seq: '@', aria: 'At sign' },
  { label: ':', seq: ':', aria: 'Colon' },
  { label: ';', seq: ';', aria: 'Semicolon' },
  { label: '"', seq: '"', aria: 'Double quote' },
  { label: "'", seq: "'", aria: 'Single quote' },
  { label: '`', seq: '`', aria: 'Backtick' },
]

export interface TerminalKeyBarProps {
  disabled: boolean
  onKey: (sequence: string) => void
  onCopy: () => void
  onPaste: () => void
  onZoom: (step: number) => void
}

export function TerminalKeyBar({ disabled, onKey, onCopy, onPaste, onZoom }: TerminalKeyBarProps) {
  const { t } = useI18n()
  const [ctrlActive, setCtrlActive] = useState(false)
  const [altActive, setAltActive] = useState(false)

  const handleKeyPress = (seq: string) => {
    let finalSeq = seq
    if (ctrlActive && seq.length === 1) {
      const code = seq.toUpperCase().charCodeAt(0)
      if (code >= 64 && code <= 95) {
        finalSeq = String.fromCharCode(code - 64)
      }
      setCtrlActive(false)
    }
    if (altActive) {
      finalSeq = `\x1b${finalSeq}`
      setAltActive(false)
    }
    onKey(finalSeq)
  }

  return (
    <div className="ht-keybar" role="toolbar" aria-label={t('terminal.keys')}>
      {/* Actions */}
      <button
        type="button"
        className="ht-keybar__key ht-keybar__key--action"
        aria-label={t('terminal.copy.title')}
        onClick={onCopy}
      >
        <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
        {t('terminal.copy')}
      </button>

      <button
        type="button"
        className="ht-keybar__key ht-keybar__key--action"
        aria-label={t('terminal.paste')}
        disabled={disabled}
        onClick={onPaste}
      >
        <ClipboardPaste size={14} strokeWidth={1.75} aria-hidden="true" />
        {t('terminal.paste')}
      </button>

      <button
        type="button"
        className="ht-keybar__key ht-keybar__key--action"
        aria-label={t('terminal.zoomOut')}
        onClick={() => onZoom(-1)}
      >
        <ZoomOut size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="ht-keybar__key ht-keybar__key--action"
        aria-label={t('terminal.zoomIn')}
        onClick={() => onZoom(1)}
      >
        <ZoomIn size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <div className="h-5 w-px bg-[color-mix(in_srgb,var(--terminal-bright-white)_15%,transparent)] self-center mx-0.5 shrink-0" />

      {/* Modifiers */}
      <button
        type="button"
        className={`ht-keybar__key font-semibold ${ctrlActive ? 'ht-keybar__key--active' : ''}`}
        aria-label={t('terminal.ctrl')}
        disabled={disabled}
        onClick={() => setCtrlActive((v) => !v)}
      >
        CTRL
      </button>

      <button
        type="button"
        className={`ht-keybar__key font-semibold ${altActive ? 'ht-keybar__key--active' : ''}`}
        aria-label={t('terminal.alt')}
        disabled={disabled}
        onClick={() => setAltActive((v) => !v)}
      >
        ALT
      </button>

      <div className="h-5 w-px bg-[color-mix(in_srgb,var(--terminal-bright-white)_15%,transparent)] self-center mx-0.5 shrink-0" />

      {/* Navigation Keys */}
      {NAV_KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          className="ht-keybar__key"
          aria-label={k.aria}
          disabled={disabled}
          onClick={() => handleKeyPress(k.seq)}
        >
          {k.label}
        </button>
      ))}

      <div className="h-5 w-px bg-[color-mix(in_srgb,var(--terminal-bright-white)_15%,transparent)] self-center mx-0.5 shrink-0" />

      {/* Dedicated Ctrl Shortcuts */}
      {CTRL_KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          className="ht-keybar__key text-[11px] font-medium"
          aria-label={k.aria}
          disabled={disabled}
          onClick={() => onKey(k.seq)}
        >
          {k.label}
        </button>
      ))}

      <div className="h-5 w-px bg-[color-mix(in_srgb,var(--terminal-bright-white)_15%,transparent)] self-center mx-0.5 shrink-0" />

      {/* Terminal Symbols */}
      {SYMBOL_KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          className="ht-keybar__key"
          aria-label={k.aria}
          disabled={disabled}
          onClick={() => handleKeyPress(k.seq)}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}
