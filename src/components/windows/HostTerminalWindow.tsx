import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TerminalKeyBar } from '@/components/windows/terminal/TerminalKeyBar'
import { TerminalCopyModal } from '@/components/windows/terminal/TerminalCopyModal'
import { TerminalTabPane } from '@/components/windows/terminal/TerminalTabPane'
import { ChevronLeft, ChevronRight, MoreVertical, Plus, RefreshCcw, RotateCcw, SquareTerminal, Trash2, X, Zap } from 'lucide-react'
import 'xterm/css/xterm.css'
import { useWindowStore, selectGlobalContentZoom, selectGlobalFontIndex, selectGlobalTerminalFontSize, TERMINAL_FONT_DEFAULT } from '@/store/windowStore'
import {
  copyTextToClipboard,
  listTerminalPresets,
  createTerminalPreset,
  deleteTerminalPreset,
  resetTerminalPresets,
  type TerminalPreset,
} from '@/api/agent'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'
import { alertLib } from '@/lib/alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { ListRow } from '@/components/ui/ListRow'
import { EmptyState } from '@/components/ui/states'

const TERMINAL_FONT_OPTIONS = [
  'Outfit, system-ui, sans-serif',
  'Inter, Outfit, system-ui, sans-serif',
  'JetBrains Mono, monospace',
]

// ─── Tab state ────────────────────────────────────────────────────────────────
let nextTabId = 1
interface Tab {
  id: number
  label: string
  target: string
  cwd?: string
  connected: boolean
  error: boolean
  reconnecting: boolean
  startFn: ((target?: string) => Promise<void>) | null
  sendInputFn: ((cmd: string) => Promise<void>) | null
}

// What a terminal's state is called and which color shows it
function statusOf(tab: Tab) {
  if (tab.error) return { key: 'error', color: 'var(--status-error)' }
  if (tab.reconnecting) return { key: 'reconnecting', color: 'var(--panel-warning-text)' }
  if (tab.connected) return { key: 'connected', color: 'var(--status-online)' }
  return { key: 'offline', color: 'var(--status-offline)' }
}

// ─── Main component ───────────────────────────────────────────────────────────
// The folder named last in a path, for the label of a terminal opened there
function folderLabel(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : '/'
}

export function HostTerminalWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const globalContentZoom      = useWindowStore(selectGlobalContentZoom)
  const globalFontIndex        = useWindowStore(selectGlobalFontIndex)
  const globalTerminalFontSize = useWindowStore(selectGlobalTerminalFontSize)
  const fontFamily = TERMINAL_FONT_OPTIONS[globalFontIndex] ?? TERMINAL_FONT_OPTIONS[2]
  const fontSize   = Math.max(7, Math.round(globalTerminalFontSize * globalContentZoom * 10) / 10)

  // Size steps from Ctrl + wheel or Ctrl + / - / 0; the store keeps it between sessions
  const zoom = useCallback((step: number) => {
    const state = useWindowStore.getState()
    state.setGlobalTerminalFontSize(step === 0 ? TERMINAL_FONT_DEFAULT : state.globalTerminalFontSize + step)
  }, [])

  // a short readout of the size after each change, so the step is visible
  const [zoomHint, setZoomHint] = useState('')
  const firstSize = useRef(true)
  useEffect(() => {
    if (firstSize.current) {
      firstSize.current = false
      return
    }
    setZoomHint(`${globalTerminalFontSize}px · ${Math.round((globalTerminalFontSize / TERMINAL_FONT_DEFAULT) * 100)}%`)
    const timer = window.setTimeout(() => setZoomHint(''), 900)
    return () => window.clearTimeout(timer)
  }, [globalTerminalFontSize])

  const { t } = useI18n()

  // ── Tabs ──────────────────────────────────────────────────────────────────
  // a window opened from the File Manager starts its first terminal in that folder
  const requestedCwd = typeof win?.params?.cwd === 'string' ? win.params.cwd : ''
  const cwdRequest = win?.params?.cwdRequest
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: nextTabId++, label: requestedCwd ? folderLabel(requestedCwd) : t('hostTerminal.localServer'), target: 'local', cwd: requestedCwd || undefined, connected: false, error: false, reconnecting: false, startFn: null, sendInputFn: null },
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

  const addTab = useCallback((target = 'local', label?: string, cwd?: string) => {
    const id = nextTabId++
    setTabs((prev) => [...prev, { 
      id, 
      label: label || (cwd ? folderLabel(cwd) : target === 'local' ? t('hostTerminal.localServer') : target), 
      target,
      cwd,
      connected: false, 
      error: false, 
      reconnecting: false,
      startFn: null, 
      sendInputFn: null 
    }])
    setActiveTabId(id)
  }, [t])

  // Asked again while the window is open (the File Manager's Terminal button): a new terminal in that folder
  const lastCwdRequest = useRef(cwdRequest)
  useEffect(() => {
    if (cwdRequest === undefined || cwdRequest === lastCwdRequest.current) return
    lastCwdRequest.current = cwdRequest
    if (requestedCwd) addTab('local', undefined, requestedCwd)
  }, [cwdRequest, requestedCwd, addTab])

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

  const handleStatusChange = useCallback((tabId: number, connected: boolean, error: boolean, reconnecting: boolean) => {
    setTabs((prev) => (prev.some((t) => t.id === tabId && (t.connected !== connected || t.error !== error || t.reconnecting !== reconnecting))
      ? prev.map((t) => (t.id === tabId ? { ...t, connected, error, reconnecting } : t))
      : prev))
  }, [])

  const handleStart = useCallback((tabId: number, fn: (target?: string) => Promise<void>) => {
    setTabs((prev) => (prev.some((t) => t.id === tabId && t.startFn !== fn)
      ? prev.map((t) => (t.id === tabId ? { ...t, startFn: fn } : t))
      : prev))
  }, [])

  const handleSendInput = useCallback((tabId: number, fn: (cmd: string) => Promise<void>) => {
    setTabs((prev) => (prev.some((t) => t.id === tabId && t.sendInputFn !== fn)
      ? prev.map((t) => (t.id === tabId ? { ...t, sendInputFn: fn } : t))
      : prev))
  }, [])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId])

  // the text of a terminal, for a phone that cannot select from the screen: the copy sheet shows it as plain text
  const readersRef = useRef(new Map<number, () => string>())
  const selectionReadersRef = useRef(new Map<number, () => string>())
  const [copyText, setCopyText] = useState<string | null>(null)
  const handleCopyAction = async () => {
    const picked = selectionReadersRef.current.get(activeTab.id)?.() ?? ''
    if (picked) {
      try {
        await copyTextToClipboard(picked)
        toast.success(t('terminal.copy.copied'))
      } catch {
        toast.error(t('terminal.copy.failed'))
      }
      return
    }
    setCopyText(readersRef.current.get(activeTab.id)?.() ?? '')
  }
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) await activeTab.sendInputFn?.(text)
    } catch {
      alertLib.fire(t('terminal.paste'), t('terminal.paste.failed'), 'warning', 'host-terminal')
    }
  }

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

  const confirmDeletePreset = async (id: number, name: string) => {
    const ok = await alertLib.confirm(t('hostTerminal.deleteShortcutTitle'), t('hostTerminal.deleteShortcutMessage', { name }), t('common.delete'), t('common.cancel'), 'warning', 'host-terminal')
    if (ok) await handleDeletePreset(id)
  }

  const confirmResetPresets = async () => {
    const ok = await alertLib.confirm(t('hostTerminal.resetShortcutsTitle'), t('hostTerminal.resetShortcutsMessage'), t('hostTerminal.resetDefault'), t('common.cancel'), 'warning', 'host-terminal')
    if (ok) await handleResetPresets()
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

  const [showPresets, setShowPresets] = useState(false)

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

  // Actions: with one terminal a small button holds them (opens on hover or click); with several they
  // are spelled out in the tab strip. Both share the same shortcut list and SSH form.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const closeMenu = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setMenuOpen(false)
    setShowPresets(false)
    setShowSshModal(false)
  }, [])
  const openMenu = () => {
    window.clearTimeout(closeTimer.current)
    setMenuOpen(true)
  }
  // leaving the menu closes it after a moment, except while an address is being typed
  const leaveMenu = () => {
    if (showSshModal) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(closeMenu, 350)
  }
  const popupOpen = menuOpen || showPresets || showSshModal
  useEffect(() => {
    if (!popupOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popupOpen, closeMenu])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const view = showSshModal ? 'ssh' : showPresets ? 'presets' : 'main'
  const backToMenu = () => {
    setShowPresets(false)
    setShowSshModal(false)
  }

  const presetsBody = (
    <>
      <div className="ht-presets-menu__list">
        {presets.length === 0 ? <span className="ht-manager-empty">{t('hostTerminal.noShortcuts')}</span> : null}
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            role="menuitem"
            className="ht-presets-menu__item"
            disabled={!activeTab.connected && !activeTab.reconnecting}
            onClick={() => {
              closeMenu()
              void runPreset(p.command)
            }}
            title={p.command}
          >
            {p.label ? (
              <>
                <span className="ht-presets-menu__label">{p.label}</span>
                <code className="ht-presets-menu__cmd">{p.command}</code>
              </>
            ) : (
              <code className="ht-presets-menu__cmd ht-presets-menu__cmd--main">{p.command}</code>
            )}
          </button>
        ))}
      </div>
      <button type="button" className="ht-presets-menu__manage" onClick={() => { closeMenu(); setShowPresetManager(true) }}>
        {t('hostTerminal.manageCommandShortcuts')}
      </button>
    </>
  )

  const sshBody = (
    <div className="ht-menu__form">
      <input
        autoFocus
        className="ht-menu__input"
        placeholder={t('hostTerminal.sshPlaceholder')}
        aria-label={t('hostTerminal.connectRemote')}
        value={sshInput}
        onChange={(e) => setSshInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSshConnect()
            closeMenu()
          }
        }}
      />
      <button type="button" className="ht-menu__submit" disabled={!sshInput.trim()} onClick={() => { handleSshConnect(); closeMenu() }}>
        {t('hostTerminal.connect')}
      </button>
    </div>
  )

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeMenu()
  }

  // one terminal: the small button and its list
  const menuActions = (
    <div className="ht-menu" ref={menuRef} onMouseEnter={openMenu} onMouseLeave={leaveMenu}>
      <button
        type="button"
        className={`ht-menu__trigger${menuOpen ? ' ht-menu__trigger--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t('hostTerminal.actions')}
        title={t('hostTerminal.actions')}
        onClick={() => (menuOpen ? closeMenu() : openMenu())}
      >
        <MoreVertical size={15} />
      </button>

      {menuOpen && (
        <div role="menu" className={`ht-menu__panel${view === 'main' ? ' ht-menu__panel--compact' : ''}`} onKeyDown={onPanelKey}>
          {view === 'main' && (
            <>
              <button type="button" role="menuitem" className="ht-menu__item" onClick={() => { addTab(); closeMenu() }}>
                <Plus size={14} />
                <span>{t('hostTerminal.newLocalTerminal')}</span>
              </button>
              <button type="button" role="menuitem" className="ht-menu__item" onClick={() => setShowPresets(true)}>
                <Zap size={14} />
                <span>{t('hostTerminal.shortcuts')}</span>
                <ChevronRight size={13} className="ht-menu__chevron" />
              </button>
              <button type="button" role="menuitem" className="ht-menu__item" onClick={() => setShowSshModal(true)}>
                <SquareTerminal size={14} />
                <span>{t('hostTerminal.connectViaSsh')}</span>
                <ChevronRight size={13} className="ht-menu__chevron" />
              </button>
            </>
          )}
          {view === 'presets' && (
            <>
              <button type="button" className="ht-menu__back" onClick={backToMenu}>
                <ChevronLeft size={14} />
                <span>{t('hostTerminal.commandShortcuts')}</span>
              </button>
              {presetsBody}
            </>
          )}
          {view === 'ssh' && (
            <>
              <button type="button" className="ht-menu__back" onClick={backToMenu}>
                <ChevronLeft size={14} />
                <span>{t('hostTerminal.connectRemote')}</span>
              </button>
              {sshBody}
            </>
          )}
        </div>
      )}
    </div>
  )

  // several terminals: the buttons sit in the strip, each list opens under its own button;
  // Reconnect is on every tab instead
  const stripActions = (
    <div className="ht-strip-actions" ref={menuRef}>
      <button
        type="button"
        className="ht-action-btn ht-action-btn--add"
        title={t('hostTerminal.newLocalTerminal')}
        aria-label={t('hostTerminal.newLocalTerminal')}
        onClick={() => { closeMenu(); addTab() }}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        className={`ht-action-btn${showPresets ? ' ht-action-btn--active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={showPresets}
        title={t('hostTerminal.commandShortcuts')}
        onClick={() => {
          setShowSshModal(false)
          setShowPresets((v) => !v)
        }}
      >
        <Zap size={13} />
        <span>{t('hostTerminal.shortcuts')}</span>
      </button>
      <button
        type="button"
        className={`ht-action-btn${showSshModal ? ' ht-action-btn--active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={showSshModal}
        title={t('hostTerminal.connectViaSsh')}
        onClick={() => {
          setShowPresets(false)
          setShowSshModal((v) => !v)
        }}
      >
        <SquareTerminal size={13} />
        <span>SSH</span>
      </button>
      {showPresets && (
        <div role="menu" className="ht-menu__panel" onKeyDown={onPanelKey}>
          {presetsBody}
        </div>
      )}
      {showSshModal && (
        <div className="ht-menu__panel" onKeyDown={onPanelKey}>
          {sshBody}
        </div>
      )}
    </div>
  )

  return (
    <div className="ht-root">
      {/* Tab strip: only with more than one terminal */}
      {tabs.length > 1 ? (
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
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={tab.id === activeTabId}
              className={`ht-tab${tab.id === activeTabId ? ' ht-tab--active' : ''}`}
              onClick={(e) => handleTabClick(tab.id, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveTabId(tab.id)
                }
              }}
            >
              <span
                className={`ht-status-dot${tab.reconnecting ? ' ht-status-dot--pulse' : ''}`}
                title={tab.reconnecting ? t('hostTerminal.reconnecting') : undefined}
                style={{
                  background: tab.error
                    ? 'var(--status-error)'
                    : tab.reconnecting
                      ? 'var(--panel-warning-text)'
                      : tab.connected
                        ? 'var(--status-online)'
                        : 'var(--status-offline)',
                }}
              />
              <span className="ht-tab-label">{tab.label}</span>
              <button
                type="button"
                className="ht-tab-action"
                aria-label={t('hostTerminal.reconnect')}
                title={tab.reconnecting ? t('hostTerminal.reconnecting') : t('hostTerminal.reconnect')}
                disabled={tab.reconnecting}
                onClick={(e) => { e.stopPropagation(); void tab.startFn?.(tab.target) }}
              >
                <RefreshCcw size={11} className={tab.reconnecting ? 'animate-spin' : ''} />
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="ht-tab-close"
                  aria-label={t('common.close')}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="ht-tabbar-actions">{stripActions}</div>
      </div>
      ) : null}

      {/* ── Terminal and, when asked for, the shortcut manager beside it ─ */}
      <div className="ht-body">
        <div className="ht-panes">
          {zoomHint ? <div className="ht-zoom-hint" role="status">{zoomHint}</div> : null}
          {tabs.length === 1 ? (
            // status | reconnect | actions; it stays on screen while the terminal is not connected
            <div className={`ht-floating-actions${activeTab.connected ? '' : ' ht-floating-actions--alert'}`}>
              <div className="ht-floating-group">
                <span
                  className="ht-status"
                  role="status"
                  aria-label={t(`hostTerminal.status.${statusOf(activeTab).key}`)}
                  title={t(`hostTerminal.status.${statusOf(activeTab).key}`)}
                >
                  <span className={`ht-status-dot${activeTab.reconnecting ? ' ht-status-dot--pulse' : ''}`} style={{ background: statusOf(activeTab).color }} />
                </span>
                <button
                  type="button"
                  className="ht-action-btn ht-action-btn--icon"
                  disabled={activeTab.reconnecting}
                  onClick={handleReconnect}
                  title={activeTab.reconnecting ? t('hostTerminal.reconnecting') : t('hostTerminal.reconnect')}
                  aria-label={t('hostTerminal.reconnect')}
                >
                  <RefreshCcw size={14} className={activeTab.reconnecting ? 'animate-spin' : ''} />
                </button>
                {menuActions}
              </div>
            </div>
          ) : null}
          {tabs.map((tab) => (
            <TerminalTabPane
              key={tab.id}
              authenticated={authenticated}
              active={tab.id === activeTabId}
              target={tab.target}
              cwd={tab.cwd}
              fontFamily={fontFamily}
              fontSize={fontSize}
              onZoom={zoom}
              onStatusChange={(c, e, r) => handleStatusChange(tab.id, c, e, r)}
              onStart={(fn) => handleStart(tab.id, fn)}
              onSendInput={(fn) => handleSendInput(tab.id, fn)}
              onReadText={(read) => { readersRef.current.set(tab.id, read) }}
              onConsumeSelection={(consume) => { selectionReadersRef.current.set(tab.id, consume) }}
            />
          ))}
        </div>

        {showPresetManager ? (
          <aside
            className="ht-side"
            aria-label={t('hostTerminal.manageCommandShortcutsTitle')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowPresetManager(false)
            }}
          >
            <div className="ht-side__header">
              <h3 className="ht-side__title">
                {/* <Zap size={14} /> */}
                <span>{t('hostTerminal.manageCommandShortcutsTitle')}</span>
              </h3>
              <IconButton label={t('common.close')} onClick={() => setShowPresetManager(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="ht-side__body">
              <form
                className="space-y-2.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleAddPreset()
                }}
              >
                <Field label={t('hostTerminal.shortcutLabel')}>
                  <TextInput placeholder={t('hostTerminal.optionalLabel')} value={newLabel} maxLength={40} onChange={(e) => setNewLabel(e.target.value)} />
                </Field>
                <Field label={t('hostTerminal.shortcutCommand')}>
                  <TextInput mono placeholder={t('hostTerminal.commandExample')} value={newCommand} onChange={(e) => setNewCommand(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" size="sm" block icon={<Plus className="h-3.5 w-3.5" />} loading={addingPreset} disabled={!newCommand.trim()}>
                  {t('hostTerminal.add')}
                </Button>
              </form>

              {presets.length === 0 ? (
                <EmptyState icon={<Zap />}>{t('hostTerminal.noShortcuts')}</EmptyState>
              ) : (
                <div className="ht-side__list">
                  {presets.map((p) => (
                    <ListRow
                      key={p.id}
                      title={p.label || <span className="panel-mono">{p.command}</span>}
                      details={p.label ? <span className="panel-mono break-all">{p.command}</span> : undefined}
                      actions={
                        <IconButton label={t('common.delete')} tone="danger" disabled={deletingId === p.id} onClick={() => void confirmDeletePreset(p.id, p.label || p.command)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="ht-side__footer">
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={resetting} onClick={() => void confirmResetPresets()}>
                {t('hostTerminal.resetDefault')}
              </Button>
            </div>
          </aside>
        ) : null}
      </div>

      <div className="hidden mobile:block">
        <TerminalKeyBar
          disabled={!activeTab.connected}
          onKey={(sequence) => {
            void activeTab.sendInputFn?.(sequence)
          }}
          onCopy={() => void handleCopyAction()}
          onPaste={() => void pasteFromClipboard()}
          onZoom={zoom}
        />
      </div>
      <TerminalCopyModal text={copyText ?? ''} open={copyText !== null} onClose={() => setCopyText(null)} />
    </div>
  )
}




