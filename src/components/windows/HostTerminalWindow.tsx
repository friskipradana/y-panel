import { useEffect, useMemo, useRef } from 'react'
import { AlertCircle, LoaderCircle, Power, RefreshCcw, TerminalSquare } from 'lucide-react'
import { useTerminalSession } from '@/hooks/useTerminalSession'

const PRESETS = [
  'whoami',
  'hostnamectl',
  'uptime',
  'df -h',
  'free -h',
  'docker ps -a',
  'systemctl status ui-panel --no-pager',
  'journalctl -u ui-panel -n 50 --no-pager',
]

export function HostTerminalWindow() {
  const terminal = useTerminalSession()
  const viewportRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    if (
      !terminal.sessionId
      && !terminal.starting
      && !terminal.connected
      && !terminal.closedByUser
    ) {
      void terminal.start()
    }
  }, [terminal.closedByUser, terminal.connected, terminal.sessionId, terminal.starting, terminal.start])

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight
    }
  }, [terminal.output])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const syncSize = () => {
      const styles = window.getComputedStyle(viewport)
      const fontSize = Number.parseFloat(styles.fontSize) || 12
      const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.7
      const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0)
      const verticalPadding = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0)
      const charWidth = fontSize * 0.62
      const cols = Math.max(20, Math.floor((viewport.clientWidth - horizontalPadding) / charWidth))
      const rows = Math.max(8, Math.floor((viewport.clientHeight - verticalPadding) / lineHeight))
      terminal.updateTerminalSize(cols, rows)
    }

    syncSize()

    const observer = new ResizeObserver(() => {
      syncSize()
    })

    observer.observe(viewport)
    window.addEventListener('resize', syncSize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncSize)
    }
  }, [terminal])

  const status = useMemo(() => {
    if (terminal.starting) return 'Menyambungkan shell...'
    if (terminal.error) return terminal.error
    if (terminal.closed) return 'Session ditutup'
    if (terminal.connected) return 'Session aktif'
    return 'Menunggu koneksi'
  }, [terminal.closed, terminal.connected, terminal.error, terminal.starting])

  const statusTone = useMemo(() => {
    if (terminal.error) return 'danger'
    if (terminal.connected) return 'success'
    if (terminal.starting) return 'warning'
    return 'muted'
  }, [terminal.connected, terminal.error, terminal.starting])

  const runPreset = async (command: string) => {
    await terminal.sendInput(`${command}\n`)
    viewportRef.current?.focus()
  }

  return (
    <div className="host-terminal-shell host-terminal-shell--themed">
      <div className="host-terminal-console-card host-terminal-console-card--aurora">
        <div className="host-terminal-console-head host-terminal-console-head--compact">
          <div className="host-terminal-console-head-left">
            <span className="host-terminal-dot host-terminal-dot--red" />
            <span className="host-terminal-dot host-terminal-dot--amber" />
            <span className="host-terminal-dot host-terminal-dot--green" />
            <span className="host-terminal-console-label">Host Shell</span>
          </div>

          <div className="host-terminal-console-meta">
            <div className={`host-terminal-badge host-terminal-badge--${statusTone}`}>
              {terminal.error ? <AlertCircle size={14} /> : terminal.starting ? <LoaderCircle size={14} className="animate-spin" /> : <TerminalSquare size={14} />}
              {status}
            </div>

            <button
              id="host-terminal-reconnect"
              className="host-terminal-secondary"
              onClick={() => void terminal.start()}
              disabled={terminal.starting}
            >
              <RefreshCcw size={14} /> Reconnect
            </button>

            <button
              id="host-terminal-close"
              className="host-terminal-secondary host-terminal-secondary--danger"
              onClick={() => void terminal.close()}
              disabled={!terminal.sessionId}
            >
              <Power size={14} /> Close session
            </button>
          </div>
        </div>

        <pre
          id="host-terminal-output"
          ref={viewportRef}
          className="host-terminal-console host-terminal-console--compact"
          tabIndex={0}
          onKeyDown={(event) => {
            terminal.handleTerminalKey(event.nativeEvent)
          }}
          onClick={() => viewportRef.current?.focus()}
        >
          {terminal.output || 'Membuka shell host...\n'}
          <span className="host-terminal-caret" aria-hidden="true">█</span>
        </pre>
      </div>

      <div className="host-terminal-footer host-terminal-footer--stacked">
        <div className="host-terminal-presets host-terminal-presets--soft">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              id={`host-terminal-preset-${preset.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
              className="host-terminal-preset"
              onClick={() => void runPreset(preset)}
              disabled={!terminal.connected}
            >
              {preset}
            </button>
          ))}
        </div>

        <p className="host-terminal-hint">
          Klik area terminal lalu ketik langsung. Enter, Backspace, Tab, tombol panah, Ctrl+C, Ctrl+D, dan Ctrl+L didukung.
        </p>
      </div>
    </div>
  )
}
