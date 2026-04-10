import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCcw, RotateCcw, Trash2, X } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { useWindowStore, selectGlobalContentZoom, selectGlobalFontIndex, selectGlobalTerminalFontSize } from '@/store/windowStore'
import { useTerminalSession } from '@/hooks/useTerminalSession'
import {
  listTerminalPresets,
  createTerminalPreset,
  deleteTerminalPreset,
  resetTerminalPresets,
  type TerminalPreset,
} from '@/api/agent'

// ─── Xterm theme ─────────────────────────────────────────────────────────────
const XTERM_THEME = {
  background:          '#0d1117',
  foreground:          '#c9d1d9',
  cursor:              '#f59e0b',
  cursorAccent:        '#0d1117',
  selectionBackground: 'rgba(96,165,250,0.22)',
  selectionForeground: '#f8fbff',
  black:    '#0f172a', red:    '#fb7185', green:   '#34d399', yellow: '#fbbf24',
  blue:     '#60a5fa', magenta:'#a78bfa', cyan:    '#22d3ee', white:  '#cdd9e5',
  brightBlack: '#475569', brightRed: '#fda4af', brightGreen: '#6ee7b7',
  brightYellow: '#fcd34d', brightBlue: '#93c5fd', brightMagenta: '#c4b5fd',
  brightCyan: '#67e8f9', brightWhite: '#ffffff',
}

const TERMINAL_FONT_OPTIONS = [
  'Outfit, system-ui, sans-serif',
  'Inter, Outfit, system-ui, sans-serif',
  'JetBrains Mono, monospace',
]

// ─── Single terminal pane ─────────────────────────────────────────────────────
interface TerminalTabPaneProps {
  active: boolean
  fontFamily: string
  fontSize: number
  onStatusChange?: (connected: boolean, error: boolean) => void
  onStart?: (start: () => Promise<void>) => void
  onSendInput?: (fn: (cmd: string) => Promise<void>) => void
}

function TerminalTabPane({ active, fontFamily, fontSize, onStatusChange, onStart, onSendInput }: TerminalTabPaneProps) {
  const {
    sessionId, starting, connected, error,
    start, sendInput, updateTerminalSize, setOutputListener, close,
  } = useTerminalSession()

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const xtermRef    = useRef<Terminal | null>(null)
  const fitRef      = useRef<FitAddon | null>(null)

  useEffect(() => { onStart?.(start) }, [onStart, start])
  useEffect(() => { onSendInput?.(sendInput) }, [onSendInput, sendInput])
  useEffect(() => { onStatusChange?.(connected, !!error) }, [connected, error, onStatusChange])

  // Auto-start
  useEffect(() => {
    if (!sessionId && !starting && !connected) void start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mount xterm once
  useEffect(() => {
    const host = viewportRef.current
    if (!host || xtermRef.current) return
    const xterm = new Terminal({
      cursorBlink: true, fontFamily, fontSize,
      lineHeight: 1.22, convertEol: true, scrollback: 5000,
      allowTransparency: true, theme: XTERM_THEME,
    })
    const fit = new FitAddon()
    fitRef.current = fit
    xterm.loadAddon(fit)
    xterm.open(host)
    xtermRef.current = xterm
    const syncSize = () => {
      if (!xtermRef.current || !fitRef.current || !viewportRef.current?.isConnected) return
      fitRef.current.fit()
      updateTerminalSize(xtermRef.current.cols, xtermRef.current.rows)
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(syncSize))
    ro.observe(host)
    window.addEventListener('resize', syncSize)
    const d = xterm.onData((v) => void sendInput(v))
    requestAnimationFrame(() => { syncSize(); xterm.focus() })
    return () => {
      ro.disconnect()
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

  // Force resize sync on connection or active status
  useEffect(() => {
    if (!connected || !active) return
    let count = 0
    const interval = setInterval(() => {
      count++
      fitRef.current?.fit()
      const x = xtermRef.current
      if (x) {
        updateTerminalSize(x.cols, x.rows)
        if (count === 1) x.focus() // Focus on first try
      }
      if (count > 12) clearInterval(interval) // Stop after 3 seconds
    }, 250)

    // Also strictly refit when document fonts finish loading
    void document.fonts.ready.then(() => {
      fitRef.current?.fit()
      const x = xtermRef.current
      if (x) updateTerminalSize(x.cols, x.rows)
    })

    return () => clearInterval(interval)
  }, [connected, active, updateTerminalSize])

  useEffect(() => {
    const x = xtermRef.current; if (!x) return
    // Toggling the font family forces xterm to invalidate its character cell cache
    x.options.fontFamily = 'serif'
    requestAnimationFrame(() => {
      x.options.fontFamily = fontFamily
      x.options.fontSize = fontSize
      requestAnimationFrame(() => { fitRef.current?.fit(); updateTerminalSize(x.cols, x.rows) })
    })
  }, [fontFamily, fontSize, updateTerminalSize])

  useEffect(() => { if (starting) xtermRef.current?.reset() }, [starting])
  useEffect(() => () => { void close() }, [close])

  return (
    <div
      ref={viewportRef}
      className="ht-pane"
      style={{
        visibility: active ? 'visible' : 'hidden',
        zIndex: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
      }}
      onClick={() => xtermRef.current?.focus()}
    />
  )
}

// ─── Tab state ────────────────────────────────────────────────────────────────
let nextTabId = 1
interface Tab {
  id: number
  label: string
  connected: boolean
  error: boolean
  startFn: (() => Promise<void>) | null
  sendInputFn: ((cmd: string) => Promise<void>) | null
}

// ─── Main component ───────────────────────────────────────────────────────────
export function HostTerminalWindow() {
  const globalContentZoom      = useWindowStore(selectGlobalContentZoom)
  const globalFontIndex        = useWindowStore(selectGlobalFontIndex)
  const globalTerminalFontSize = useWindowStore(selectGlobalTerminalFontSize)
  const fontFamily = TERMINAL_FONT_OPTIONS[globalFontIndex] ?? TERMINAL_FONT_OPTIONS[2]
  const fontSize   = Math.max(7, Math.round(globalTerminalFontSize * globalContentZoom * 10) / 10)

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: nextTabId++, label: 'Local server', connected: false, error: false, startFn: null, sendInputFn: null },
  ])
  const [activeTabId, setActiveTabId] = useState<number>(tabs[0].id)

  const addTab = useCallback(() => {
    const id = nextTabId++
    setTabs((prev) => [...prev, { id, label: 'Local server', connected: false, error: false, startFn: null, sendInputFn: null }])
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback((id: number) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev
      const next = prev.filter((t) => t.id !== id)
      if (id === activeTabId) {
        const idx = prev.findIndex((t) => t.id === id)
        setActiveTabId(next[Math.max(0, idx - 1)].id)
      }
      return next
    })
  }, [activeTabId])

  const handleStatusChange = useCallback((tabId: number, connected: boolean, error: boolean) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, connected, error } : t))
  }, [])

  const handleStart = useCallback((tabId: number, fn: () => Promise<void>) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, startFn: fn } : t))
  }, [])

  const handleSendInput = useCallback((tabId: number, fn: (cmd: string) => Promise<void>) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, sendInputFn: fn } : t))
  }, [])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId])

  const handleReconnect = () => activeTab.startFn?.()

  const runPreset = async (command: string) => {
    const fn = activeTab.sendInputFn
    if (!fn) return
    await fn(`${command}\r`)
  }

  // ── Presets ───────────────────────────────────────────────────────────────
  const [presets, setPresets] = useState<TerminalPreset[]>([])
  const [showPresetManager, setShowPresetManager] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [addingPreset, setAddingPreset] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)

  const loadPresets = useCallback(async () => {
    try {
      const list = await listTerminalPresets()
      setPresets(list)
    } catch {
      // silent fail — fallback ke empty
    }
  }, [])

  useEffect(() => { void loadPresets() }, [loadPresets])

  const handleAddPreset = async () => {
    const cmd = newCommand.trim()
    if (!cmd) return
    setAddingPreset(true)
    try {
      const created = await createTerminalPreset(newLabel.trim(), cmd)
      setPresets((prev) => [...prev, created])
      setNewLabel('')
      setNewCommand('')
    } finally {
      setAddingPreset(false)
    }
  }

  const handleDeletePreset = async (id: number) => {
    setDeletingId(id)
    try {
      await deleteTerminalPreset(id)
      setPresets((prev) => prev.filter((p) => p.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const handleResetPresets = async () => {
    setResetting(true)
    try {
      const data = await resetTerminalPresets()
      if (data.presets) setPresets(data.presets)
      else await loadPresets()
    } finally {
      setResetting(false)
    }
  }

  // ── Drag to scroll for presets ──────────────────────────────────────────
  const presetsScrollRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const scrollLeftRef = useRef(0)
  const hasDraggedRef = useRef(false)

  const handlePresetsMouseDown = (e: React.MouseEvent) => {
    if (!presetsScrollRef.current) return
    isDraggingRef.current = true
    hasDraggedRef.current = false
    startXRef.current = e.pageX - presetsScrollRef.current.offsetLeft
    scrollLeftRef.current = presetsScrollRef.current.scrollLeft
  }
  const handlePresetsMouseLeave = () => { isDraggingRef.current = false }
  const handlePresetsMouseUp = () => { isDraggingRef.current = false }
  const handlePresetsMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !presetsScrollRef.current) return
    e.preventDefault()
    const x = e.pageX - presetsScrollRef.current.offsetLeft
    const walk = (x - startXRef.current) * 1.5
    if (Math.abs(walk) > 3) hasDraggedRef.current = true
    presetsScrollRef.current.scrollLeft = scrollLeftRef.current - walk
  }

  const handlePresetClick = (command: string, e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    void runPreset(command)
  }

  return (
    <div className="ht-root">
      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="ht-tabbar">
        <div className="ht-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`ht-tab${tab.id === activeTabId ? ' ht-tab--active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="ht-status-dot" style={{
                background: tab.error ? '#f87171' : tab.connected ? '#4ade80' : '#6b7280',
              }} />
              <span className="ht-tab-label">{tab.label}</span>
              {tabs.length > 1 && (
                <button className="ht-tab-close" onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}>
                  <X size={11} />
                </button>
              )}
            </button>
          ))}
        </div>
        <div className="ht-tabbar-actions">
          <button className="ht-action-btn" onClick={handleReconnect} title="Reconnect">
            <RefreshCcw size={13} /><span>Reconnect</span>
          </button>
          <button className="ht-action-btn ht-action-btn--add" onClick={addTab} title="New terminal tab">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* ── Preset shortcut bar ──────────────────────────────────────── */}
      <div className="ht-footer">
        <div 
          className="ht-presets-scroll"
          ref={presetsScrollRef}
          onMouseDown={handlePresetsMouseDown}
          onMouseLeave={handlePresetsMouseLeave}
          onMouseUp={handlePresetsMouseUp}
          onMouseMove={handlePresetsMouseMove}
        >
          {presets.map((p) => (
            <button
              key={p.id}
              className="ht-preset-btn"
              onClick={(e) => handlePresetClick(p.command, e)}
              disabled={!activeTab.connected}
              title={p.command}
            >
              {p.label || p.command}
            </button>
          ))}
        </div>
        <button
          className={`ht-action-btn ht-manage-btn${showPresetManager ? ' ht-action-btn--active' : ''}`}
          onClick={() => setShowPresetManager((v) => !v)}
          title="Kelola pintasan perintah"
        >
          Kelola
        </button>
      </div>

      {/* ── Preset manager panel ─────────────────────────────────────── */}
      {showPresetManager && (
        <div className="ht-manager">
          <div className="ht-manager-header">
            <span>Kelola Pintasan Perintah</span>
            <button className="ht-manager-reset" onClick={handleResetPresets} disabled={resetting} title="Reset ke default">
              <RotateCcw size={13} />
              <span>{resetting ? 'Mereset...' : 'Reset default'}</span>
            </button>
          </div>

          {/* Add form */}
          <div className="ht-manager-add">
            <input
              className="ht-manager-input"
              placeholder="Label (opsional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <input
              className="ht-manager-input ht-manager-input--flex"
              placeholder="Perintah, mis: df -h"
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddPreset() }}
            />
            <button
              className="ht-manager-save"
              onClick={() => void handleAddPreset()}
              disabled={addingPreset || !newCommand.trim()}
            >
              {addingPreset ? '...' : <><Plus size={13} /> Tambah</>}
            </button>
          </div>

          {/* List */}
          <div className="ht-manager-list">
            {presets.length === 0 && (
              <span className="ht-manager-empty">Belum ada pintasan.</span>
            )}
            {presets.map((p) => (
              <div key={p.id} className="ht-manager-row">
                <span className="ht-manager-row-label">{p.label || <em style={{ opacity: 0.5 }}>—</em>}</span>
                <code className="ht-manager-row-cmd">{p.command}</code>
                <button
                  className="ht-manager-del"
                  onClick={() => void handleDeletePreset(p.id)}
                  disabled={deletingId === p.id}
                  title="Hapus"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Terminal panes ───────────────────────────────────────────── */}
      <div className="ht-panes">
        {tabs.map((tab) => (
          <TerminalTabPane
            key={tab.id}
            active={tab.id === activeTabId}
            fontFamily={fontFamily}
            fontSize={fontSize}
            onStatusChange={(c, e) => handleStatusChange(tab.id, c, e)}
            onStart={(fn) => handleStart(tab.id, fn)}
            onSendInput={(fn) => handleSendInput(tab.id, fn)}
          />
        ))}
      </div>
    </div>
  )
}
