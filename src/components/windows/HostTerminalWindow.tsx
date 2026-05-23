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
import { useI18n } from '@/lib/i18n'

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

const TERMINAL_FONT_OPTIONS = [
  'Outfit, system-ui, sans-serif',
  'Inter, Outfit, system-ui, sans-serif',
  'JetBrains Mono, monospace',
]

// ─── Single terminal pane ─────────────────────────────────────────────────────
interface TerminalTabPaneProps {
  authenticated?: boolean
  active: boolean
  target?: string
  fontFamily: string
  fontSize: number
  onStatusChange?: (connected: boolean, error: boolean) => void
  onStart?: (start: (target?: string) => Promise<void>) => void
  onSendInput?: (fn: (cmd: string) => Promise<void>) => void
}

function TerminalTabPane({ authenticated, active, target = 'local', fontFamily, fontSize, onStatusChange, onStart, onSendInput }: TerminalTabPaneProps) {
  const {
    starting, connected, error,
    start, sendInput, updateTerminalSize, setOutputListener, close,
  } = useTerminalSession()

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const xtermRef    = useRef<Terminal | null>(null)
  const fitRef      = useRef<FitAddon | null>(null)

  useEffect(() => { onStart?.(start) }, [onStart, start])
  useEffect(() => { onSendInput?.(sendInput) }, [onSendInput, sendInput])
  useEffect(() => { onStatusChange?.(connected, !!error) }, [connected, error, onStatusChange])

  // Auto-start and Re-connect on authentication
  useEffect(() => {
    if (authenticated && (!connected || error) && !starting) {
      console.log(`[Terminal] Session recovered or initial mount. Starting session for ${target}...`)
      void start(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]) 

  // Mount xterm once
  useEffect(() => {
    const host = viewportRef.current
    if (!host || xtermRef.current) return
    const xterm = new Terminal({
      cursorBlink: true, fontFamily, fontSize,
      lineHeight: 1.22, convertEol: true, scrollback: 5000,
      allowTransparency: true, theme: createXtermTheme(),
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
  target: string
  connected: boolean
  error: boolean
  startFn: ((target?: string) => Promise<void>) | null
  sendInputFn: ((cmd: string) => Promise<void>) | null
}

// ─── Main component ───────────────────────────────────────────────────────────
export function HostTerminalWindow({ authenticated }: { authenticated?: boolean }) {
  const globalContentZoom      = useWindowStore(selectGlobalContentZoom)
  const globalFontIndex        = useWindowStore(selectGlobalFontIndex)
  const globalTerminalFontSize = useWindowStore(selectGlobalTerminalFontSize)
  const fontFamily = TERMINAL_FONT_OPTIONS[globalFontIndex] ?? TERMINAL_FONT_OPTIONS[2]
  const fontSize   = Math.max(7, Math.round(globalTerminalFontSize * globalContentZoom * 10) / 10)

  const { t } = useI18n()

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: nextTabId++, label: t('hostTerminal.localServer'), target: 'local', connected: false, error: false, startFn: null, sendInputFn: null },
  ])
  const [activeTabId, setActiveTabId] = useState<number>(tabs[0].id)

  const [showSshModal, setShowSshModal] = useState(false)
  const [sshInput, setSshInput] = useState('')

  useEffect(() => {
    if (authenticated) {
       void loadPresets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const addTab = useCallback((target = 'local', label?: string) => {
    const id = nextTabId++
    setTabs((prev) => [...prev, { 
      id, 
      label: label || (target === 'local' ? t('hostTerminal.localServer') : target), 
      target,
      connected: false, 
      error: false, 
      startFn: null, 
      sendInputFn: null 
    }])
    setActiveTabId(id)
  }, [])

  const handleSshConnect = () => {
    const t = sshInput.trim()
    if (!t) return
    addTab(t)
    setSshInput('')
    setShowSshModal(false)
  }

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

  const handleStart = useCallback((tabId: number, fn: (target?: string) => Promise<void>) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, startFn: fn } : t))
  }, [])

  const handleSendInput = useCallback((tabId: number, fn: (cmd: string) => Promise<void>) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, sendInputFn: fn } : t))
  }, [])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId])

  const handleReconnect = () => activeTab.startFn?.(activeTab.target)

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

  // ── Drag to scroll for tabs ─────────────────────────────────────────────
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const isTabDraggingRef = useRef(false)
  const tabStartXRef = useRef(0)
  const tabScrollLeftRef = useRef(0)
  const tabHasDraggedRef = useRef(false)

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return
    isTabDraggingRef.current = true
    tabHasDraggedRef.current = false
    tabStartXRef.current = e.pageX - tabsScrollRef.current.offsetLeft
    tabScrollLeftRef.current = tabsScrollRef.current.scrollLeft
  }
  const handleTabsMouseLeave = () => { isTabDraggingRef.current = false }
  const handleTabsMouseUp = () => { isTabDraggingRef.current = false }
  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isTabDraggingRef.current || !tabsScrollRef.current) return
    e.preventDefault()
    const x = e.pageX - tabsScrollRef.current.offsetLeft
    const walk = (x - tabStartXRef.current) * 1.5
    if (Math.abs(walk) > 3) tabHasDraggedRef.current = true
    tabsScrollRef.current.scrollLeft = tabScrollLeftRef.current - walk
  }

  const handleTabClick = (id: number, e: React.MouseEvent) => {
    if (tabHasDraggedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    setActiveTabId(id)
  }

  // ── Auto-focus scroll for active tab ────────────────────────────────────
  useEffect(() => {
    if (!tabsScrollRef.current) return
    const container = tabsScrollRef.current
    requestAnimationFrame(() => {
      const activeEl = container.querySelector('.ht-tab--active') as HTMLElement | null
      if (activeEl) {
        const elLeft = activeEl.offsetLeft
        const elWidth = activeEl.offsetWidth
        const contScroll = container.scrollLeft
        const contWidth = container.offsetWidth

        // Scroll to center the tab if it's partly or completely hidden
        if (elLeft < contScroll || elLeft + elWidth > contScroll + contWidth) {
          container.scrollTo({ left: elLeft - contWidth / 2 + elWidth / 2, behavior: 'smooth' })
        }
      }
    })
  }, [activeTabId, tabs.length])

  return (
    <div className="ht-root">
      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="ht-tabbar">
        <div 
          className="ht-tabs"
          ref={tabsScrollRef}
          onMouseDown={handleTabsMouseDown}
          onMouseLeave={handleTabsMouseLeave}
          onMouseUp={handleTabsMouseUp}
          onMouseMove={handleTabsMouseMove}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`ht-tab${tab.id === activeTabId ? ' ht-tab--active' : ''}`}
              onClick={(e) => handleTabClick(tab.id, e)}
            >
              <span className="ht-status-dot" style={{
                background: tab.error ? 'var(--status-error)' : tab.connected ? 'var(--status-online)' : 'var(--status-offline)',
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
          <button className="ht-action-btn" onClick={handleReconnect} title={t('hostTerminal.reconnect')}>
            <RefreshCcw size={13} /><span>{t('hostTerminal.reconnect')}</span>
          </button>
          
          <div className="relative flex items-center gap-1 ml-1 pl-1 border-l border-[var(--win-border)]">
            <button 
              className={`ht-action-btn ${showSshModal ? 'bg-[var(--panel-primary-hover)] text-[var(--panel-primary-text)]' : ''}`} 
              onClick={() => setShowSshModal(!showSshModal)} 
              title={t('hostTerminal.connectViaSsh')}
            >
              <Plus size={14} className="rotate-45" />
              <span>SSH</span>
            </button>

            {showSshModal && (
              <div className="absolute top-[40px] right-0 w-64 p-3 rounded-2xl bg-[var(--menu-bg)] backdrop-blur-xl border border-[var(--win-border)] shadow-2xl z-[50]">
                <div className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">{t('hostTerminal.connectRemote')}</div>
                <input 
                  autoFocus
                  className="w-full px-3 py-2 bg-[var(--panel-code-bg)] border border-[var(--win-border)] rounded-xl text-[var(--win-text)] text-[12px] focus:border-[var(--focus-ring)]/50 outline-none transition-all"
                  placeholder={t('hostTerminal.sshPlaceholder')}
                  value={sshInput}
                  onChange={(e) => setSshInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSshConnect()
                    if (e.key === 'Escape') setShowSshModal(false)
                  }}
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button className="px-3 py-2 text-[12px] font-bold text-[var(--text-secondary)] hover:text-[var(--win-text)]" onClick={() => setShowSshModal(false)}>{t('common.cancel')}</button>
                  <button className="px-3 py-2 bg-[var(--panel-primary-solid)] hover:bg-[var(--panel-primary-hover)] text-[var(--win-text)] text-[12px] font-bold rounded-lg shadow-lg" onClick={handleSshConnect}>{t('hostTerminal.connect')}</button>
                </div>
              </div>
            )}

            <button className="ht-action-btn ht-action-btn--add" onClick={() => addTab()} title={t('hostTerminal.newLocalTerminal')}>
              <Plus size={14} />
            </button>
          </div>
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
          title={t('hostTerminal.manageCommandShortcuts')}
        >
          {t('hostTerminal.manage')}
        </button>
      </div>

      {/* ── Preset manager panel ─────────────────────────────────────── */}
      {showPresetManager && (
        <div className="ht-manager">
          <div className="ht-manager-header">
            <span>{t('hostTerminal.manageCommandShortcutsTitle')}</span>
            <button className="ht-manager-reset" onClick={handleResetPresets} disabled={resetting} title={t('hostTerminal.resetToDefault')}>
              <RotateCcw size={13} />
              <span>{resetting ? t('hostTerminal.resetting') : t('hostTerminal.resetDefault')}</span>
            </button>
          </div>

          {/* Add form */}
          <div className="ht-manager-add">
            <input
              className="ht-manager-input"
              placeholder={t('hostTerminal.optionalLabel')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <input
              className="ht-manager-input ht-manager-input--flex"
              placeholder={t('hostTerminal.commandExample')}
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddPreset() }}
            />
            <button
              className="ht-manager-save"
              onClick={() => void handleAddPreset()}
              disabled={addingPreset || !newCommand.trim()}
            >
              {addingPreset ? '...' : <><Plus size={13} /> {t('hostTerminal.add')}</>}
            </button>
          </div>

          {/* List */}
          <div className="ht-manager-list">
            {presets.length === 0 && (
              <span className="ht-manager-empty">{t('hostTerminal.noShortcuts')}</span>
            )}
            {presets.map((p) => (
              <div key={p.id} className="ht-manager-row">
                <span className="ht-manager-row-label">{p.label || <em style={{ opacity: 0.5 }}>—</em>}</span>
                <code className="ht-manager-row-cmd">{p.command}</code>
                <button
                  className="ht-manager-del"
                  onClick={() => void handleDeletePreset(p.id)}
                  disabled={deletingId === p.id}
                  title={t('common.delete')}
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
            authenticated={authenticated}
            active={tab.id === activeTabId}
            target={tab.target}
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




