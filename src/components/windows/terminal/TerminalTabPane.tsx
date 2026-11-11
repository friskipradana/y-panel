import { useEffect, useRef, useState } from 'react'
import { Copy, X } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { readTerminalText } from '@/components/windows/terminal/terminalText'
import { useTerminalTouchSelect } from '@/components/windows/terminal/useTerminalTouchSelect'
import { usePinchZoom } from '@/hooks/usePinchZoom'
import { useTerminalSession } from '@/hooks/useTerminalSession'
import { useI18n } from '@/lib/i18n'
import { useThemeStore } from '@/store/themeStore'

const cssVar = (name: string) => {
  if (typeof window === 'undefined') return `var(${name})`
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || `var(${name})`
}

const createXtermTheme = () => ({
  background: cssVar('--terminal-bg'),
  foreground: cssVar('--terminal-fg'),
  cursor: cssVar('--terminal-cursor'),
  cursorAccent: cssVar('--terminal-cursor-accent'),
  selectionBackground: cssVar('--terminal-selection-bg'),
  selectionInactiveBackground: cssVar('--terminal-selection-bg'),
  selectionForeground: cssVar('--terminal-selection-fg'),
  black: cssVar('--terminal-black'),
  red: cssVar('--terminal-red'),
  green: cssVar('--terminal-green'),
  yellow: cssVar('--terminal-yellow'),
  blue: cssVar('--terminal-blue'),
  magenta: cssVar('--terminal-magenta'),
  cyan: cssVar('--terminal-cyan'),
  white: cssVar('--terminal-white'),
  brightBlack: cssVar('--terminal-bright-black'),
  brightRed: cssVar('--terminal-bright-red'),
  brightGreen: cssVar('--terminal-bright-green'),
  brightYellow: cssVar('--terminal-bright-yellow'),
  brightBlue: cssVar('--terminal-bright-blue'),
  brightMagenta: cssVar('--terminal-bright-magenta'),
  brightCyan: cssVar('--terminal-bright-cyan'),
  brightWhite: cssVar('--terminal-bright-white'),
})

export interface TerminalTabPaneProps {
  authenticated?: boolean
  active: boolean
  target?: string
  cwd?: string
  initialSessionId?: string
  onSessionChange?: (sessionId: string | null) => void
  fontFamily: string
  fontSize: number
  onZoom: (step: number) => void
  onStatusChange?: (connected: boolean, error: boolean, reconnecting: boolean) => void
  onStart?: (start: (target?: string) => Promise<void>) => void
  onSendInput?: (fn: (cmd: string) => Promise<void>) => void
  onReadText?: (read: () => string) => void
  onConsumeSelection?: (consume: () => string) => void
}

export function TerminalTabPane({
  authenticated,
  active,
  target = 'local',
  cwd,
  initialSessionId,
  onSessionChange,
  fontFamily,
  fontSize,
  onZoom,
  onStatusChange,
  onStart,
  onSendInput,
  onReadText,
  onConsumeSelection,
}: TerminalTabPaneProps) {
  const { t } = useI18n()
  const onSessionChangeRef = useRef(onSessionChange)
  onSessionChangeRef.current = onSessionChange

  const {
    starting, connected, reconnecting, error,
    start, attach, sendInput, updateTerminalSize, setOutputListener,
  } = useTerminalSession({
    initialSessionId,
    onSessionChange: (sid) => onSessionChangeRef.current?.(sid),
    onSessionInvalid: () => {
      onSessionChangeRef.current?.(null)
      if (xtermRef.current) {
        xtermRef.current.clear()
        xtermRef.current.reset()
      }
      void start(target, cwd)
    },
  })

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const themeMode = useThemeStore((s) => s.mode)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [selectedText, setSelectedText] = useState('')

  const zoomRef = useRef(onZoom)
  zoomRef.current = onZoom
  usePinchZoom(viewportRef, (step) => zoomRef.current(step))
  useTerminalTouchSelect(viewportRef, xtermRef, setSelectedText)

  const onStartRef = useRef(onStart)
  onStartRef.current = onStart
  useEffect(() => {
    onStartRef.current?.((next?: string) => start(next ?? target, cwd))
  }, [start, target, cwd])

  const onSendInputRef = useRef(onSendInput)
  onSendInputRef.current = onSendInput
  useEffect(() => {
    onSendInputRef.current?.(sendInput)
  }, [sendInput])

  const onReadTextRef = useRef(onReadText)
  onReadTextRef.current = onReadText
  useEffect(() => {
    onReadTextRef.current?.(() => (xtermRef.current ? readTerminalText(xtermRef.current) : ''))
  }, [])

  const onConsumeSelectionRef = useRef(onConsumeSelection)
  onConsumeSelectionRef.current = onConsumeSelection
  useEffect(() => {
    onConsumeSelectionRef.current?.(() => {
      const x = xtermRef.current
      if (!x || !x.hasSelection()) return ''
      const picked = x.getSelection()
      x.clearSelection()
      setSelectedText('')
      return picked
    })
  }, [])

  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange
  useEffect(() => {
    onStatusChangeRef.current?.(connected, !!error, reconnecting)
  }, [connected, error, reconnecting])

  const hasMountedRef = useRef(false)
  useEffect(() => {
    if (!authenticated || hasMountedRef.current) return
    hasMountedRef.current = true
    if (initialSessionId) {
      attach(initialSessionId)
    } else {
      void start(target, cwd)
    }
  }, [authenticated, initialSessionId, attach, start, target, cwd])

  useEffect(() => {
    const host = viewportRef.current
    if (!host || xtermRef.current) return
    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily,
      fontSize,
      lineHeight: 1.22,
      convertEol: true,
      scrollback: 5000,
      allowTransparency: true,
      theme: createXtermTheme(),
    })
    const fit = new FitAddon()
    fitRef.current = fit
    xterm.loadAddon(fit)
    xterm.open(host)
    xtermRef.current = xterm

    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && !event.altKey && ['+', '=', '-', '_', '0'].includes(key)) {
        event.preventDefault()
        zoomRef.current(key === '0' ? 0 : key === '+' || key === '=' ? 1 : -1)
        return false
      }
      if (mod && key === 'c' && (event.shiftKey || xterm.hasSelection())) {
        const text = xterm.getSelection()
        if (text) {
          void copyTextToClipboard(text).catch(() => undefined)
          xterm.clearSelection()
          setSelectedText('')
        }
        return false
      }
      if (mod && event.shiftKey && key === 'v') {
        event.preventDefault()
        void navigator.clipboard?.readText().then((text) => text && xterm.paste(text)).catch(() => undefined)
        return false
      }
      return true
    })

    const syncSize = () => {
      if (!xtermRef.current || !fitRef.current || !viewportRef.current?.isConnected) return
      fitRef.current.fit()
      updateTerminalSize(xtermRef.current.cols, xtermRef.current.rows)
    }

    let wheelAcc = 0
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      wheelAcc += event.deltaY
      if (Math.abs(wheelAcc) < 30) return
      zoomRef.current(wheelAcc < 0 ? 1 : -1)
      wheelAcc = 0
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    const ro = new ResizeObserver(() => requestAnimationFrame(syncSize))
    ro.observe(host)
    window.addEventListener('resize', syncSize)
    const d = xterm.onData((v) => void sendInput(v))
    requestAnimationFrame(() => { syncSize(); xterm.focus() })
    return () => {
      ro.disconnect()
      host.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', syncSize)
      d.dispose()
      setOutputListener(null)
      fitRef.current = null
      xterm.dispose()
      xtermRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setOutputListener((chunk) => xtermRef.current?.write(chunk))
    return () => setOutputListener(null)
  }, [setOutputListener])

  useEffect(() => {
    if (!connected || !active) return
    let count = 0
    const interval = setInterval(() => {
      count++
      fitRef.current?.fit()
      const x = xtermRef.current
      if (x) {
        updateTerminalSize(x.cols, x.rows)
        if (count === 1) x.focus()
      }
      if (count > 12) clearInterval(interval)
    }, 250)

    void document.fonts.ready.then(() => {
      fitRef.current?.fit()
      const x = xtermRef.current
      if (x) updateTerminalSize(x.cols, x.rows)
    })

    return () => clearInterval(interval)
  }, [connected, active, updateTerminalSize])

  useEffect(() => {
    const x = xtermRef.current
    if (!x) return
    x.options.fontFamily = 'serif'
    requestAnimationFrame(() => {
      x.options.fontFamily = fontFamily
      x.options.fontSize = fontSize
      requestAnimationFrame(() => { fitRef.current?.fit(); updateTerminalSize(x.cols, x.rows) })
    })
  }, [fontFamily, fontSize, updateTerminalSize])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (xtermRef.current) xtermRef.current.options.theme = createXtermTheme()
    }, 60)
    return () => window.clearTimeout(timer)
  }, [themeMode])

  useEffect(() => { if (starting) xtermRef.current?.reset() }, [starting])

  const copySelected = async () => {
    const text = xtermRef.current?.getSelection() || selectedText
    if (!text) return
    try {
      await copyTextToClipboard(text)
      toast.success(t('terminal.copy.copied'))
      xtermRef.current?.clearSelection()
      setSelectedText('')
    } catch {
      toast.error(t('terminal.copy.failed'))
    }
  }

  return (
    <div
      className="ht-pane"
      style={{
        visibility: active ? 'visible' : 'hidden',
        zIndex: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement | null)?.closest('.ht-selection-bar')) return
        if (!xtermRef.current?.hasSelection()) xtermRef.current?.focus()
      }}
    >
      <div ref={viewportRef} className="flex min-h-0 min-w-0 flex-1" />
      {selectedText ? (
        <div className="ht-selection-bar" role="toolbar" aria-label={t('terminal.copy')}>
          <button
            type="button"
            className="ht-selection-bar__btn ht-selection-bar__btn--primary"
            onClick={() => void copySelected()}
          >
            <Copy size={12} strokeWidth={1.75} />
            <span>{t('terminal.copy')}</span>
          </button>
          <button
            type="button"
            className="ht-selection-bar__btn"
            onClick={() => {
              xtermRef.current?.selectAll()
              setSelectedText(xtermRef.current?.getSelection() ?? '')
            }}
          >
            <span>{t('fileManager.selectAll')}</span>
          </button>
          <button
            type="button"
            className="ht-selection-bar__btn"
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={() => {
              xtermRef.current?.clearSelection()
              setSelectedText('')
            }}
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
