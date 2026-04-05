import { useEffect, useMemo, useRef } from 'react'
import { AlertCircle, LoaderCircle, Power, RefreshCcw, TerminalSquare } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { useWindowStore, selectGlobalContentZoom, selectGlobalFontIndex, selectGlobalTerminalFontSize } from '@/store/windowStore'
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

const TERMINAL_FONT_OPTIONS = [
  'Outfit, system-ui, sans-serif',
  'Inter, Outfit, system-ui, sans-serif',
  'JetBrains Mono, monospace',
]

export function HostTerminalWindow() {
  const {
    sessionId,
    starting,
    connected,
    closed,
    closedByUser,
    error,
    start,
    sendInput,
    updateTerminalSize,
    setOutputListener,
    close,
  } = useTerminalSession()
  const globalContentZoom = useWindowStore(selectGlobalContentZoom)
  const globalFontIndex = useWindowStore(selectGlobalFontIndex)
  const globalTerminalFontSize = useWindowStore(selectGlobalTerminalFontSize)
  const computedTerminalFontSize = Math.max(7, Math.round(globalTerminalFontSize * globalContentZoom * 10) / 10)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastRenderedOutputRef = useRef('')

  useEffect(() => {
    if (!sessionId && !starting && !connected && !closedByUser) {
      void start()
    }
  }, [closedByUser, connected, sessionId, starting, start])

  useEffect(() => {
    const host = viewportRef.current
    if (!host || xtermRef.current) return

    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily: TERMINAL_FONT_OPTIONS[globalFontIndex] ?? TERMINAL_FONT_OPTIONS[2],
      fontSize: computedTerminalFontSize,
      lineHeight: 1.2,
      convertEol: true,
      scrollback: 4000,
      allowTransparency: true,
      theme: {
        background: '#08101d',
        foreground: '#e7eefc',
        cursor: '#f59e0b',
        cursorAccent: '#08101d',
        selectionBackground: 'rgba(96, 165, 250, 0.24)',
        selectionForeground: '#f8fbff',
        black: '#0f172a',
        red: '#fb7185',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#dbe7ff',
        brightBlack: '#475569',
        brightRed: '#fda4af',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#c4b5fd',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    xterm.loadAddon(fitAddon)
    xterm.open(host)
    xtermRef.current = xterm

    const syncSize = () => {
      if (!xtermRef.current || !fitAddonRef.current || !viewportRef.current?.isConnected) return
      fitAddonRef.current.fit()
      updateTerminalSize(xtermRef.current.cols, xtermRef.current.rows)
    }

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(syncSize)
    })

    resizeObserver.observe(host)
    window.addEventListener('resize', syncSize)

    const dataDisposable = xterm.onData((value: string) => {
      void sendInput(value)
    })

    window.requestAnimationFrame(() => {
      syncSize()
      xterm.focus()
    })

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncSize)
      dataDisposable.dispose()
      setOutputListener(null)
      fitAddonRef.current = null
      xterm.dispose()
      xtermRef.current = null
      lastRenderedOutputRef.current = ''
    }
  }, [sendInput, setOutputListener, updateTerminalSize])

  useEffect(() => {
    setOutputListener((chunk) => {
      const xterm = xtermRef.current
      if (!xterm) return
      xterm.write(chunk)
      lastRenderedOutputRef.current += chunk
    })

    return () => {
      setOutputListener(null)
    }
  }, [setOutputListener])

  useEffect(() => {
    if (connected) {
      window.requestAnimationFrame(() => {
        fitAddonRef.current?.fit()
        const xterm = xtermRef.current
        if (!xterm) return
        updateTerminalSize(xterm.cols, xterm.rows)
        xterm.focus()
      })
    }
  }, [connected, updateTerminalSize])

  useEffect(() => {
    if (!starting) return

    const xterm = xtermRef.current
    if (!xterm) return

    xterm.reset()
    lastRenderedOutputRef.current = ''
  }, [starting])

  useEffect(() => {
    if (!connected && xtermRef.current && !starting) {
      xtermRef.current.blur()
    }
  }, [connected, starting])

  useEffect(() => {
    const xterm = xtermRef.current
    if (!xterm) return

    xterm.options.fontFamily = TERMINAL_FONT_OPTIONS[globalFontIndex] ?? TERMINAL_FONT_OPTIONS[2]
    xterm.options.fontSize = computedTerminalFontSize

    window.requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      updateTerminalSize(xterm.cols, xterm.rows)
    })
  }, [computedTerminalFontSize, globalFontIndex, updateTerminalSize])

  const status = useMemo(() => {
    if (starting) return 'Menyambungkan shell...'
    if (error) return error
    if (closed) return 'Session ditutup'
    if (connected) return 'Session aktif'
    return 'Menunggu koneksi'
  }, [closed, connected, error, starting])

  const statusTone = useMemo(() => {
    if (error) return 'danger'
    if (connected) return 'success'
    if (starting) return 'warning'
    return 'muted'
  }, [connected, error, starting])

  const runPreset = async (command: string) => {
    await sendInput(`${command}\r`)
    xtermRef.current?.focus()
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
              {error ? <AlertCircle size={14} /> : starting ? <LoaderCircle size={14} className="animate-spin" /> : <TerminalSquare size={14} />}
              {status}
            </div>

            <button
              id="host-terminal-reconnect"
              className="host-terminal-secondary"
              onClick={() => void start()}
              disabled={starting}
            >
              <RefreshCcw size={14} /> Reconnect
            </button>

            <button
              id="host-terminal-close"
              className="host-terminal-secondary host-terminal-secondary--danger"
              onClick={() => void close()}
              disabled={!sessionId}
            >
              <Power size={14} /> Close session
            </button>
          </div>
        </div>

        <div
          id="host-terminal-output"
          ref={viewportRef}
          className="host-terminal-console host-terminal-console--compact host-terminal-console--xterm"
          onClick={() => xtermRef.current?.focus()}
        />
      </div>

      <div className="host-terminal-footer host-terminal-footer--stacked">
        <div className="host-terminal-presets host-terminal-presets--soft">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              id={`host-terminal-preset-${preset.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
              className="host-terminal-preset"
              onClick={() => void runPreset(preset)}
              disabled={!connected}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
