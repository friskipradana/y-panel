import { useEffect, useMemo, useRef, useState } from 'react'
import { EyeOff, PanelBottom, X } from 'lucide-react'
import { useWindowStore, selectAutoHideDock, selectFocusedId, selectWindows } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import type { WindowKind, WindowState } from '@/types'

const DOCK_ITEMS: { kind: WindowKind; icon: string; label: string }[] = [
  { kind: 'apps', icon: '🐋', label: 'Docker' },
  { kind: 'projects', icon: '🗂️', label: 'Projects' },
  { kind: 'tunnels', icon: '🌐', label: 'Cloudflare' },
  { kind: 'profile', icon: '👤', label: 'Profile' },
  { kind: 'host-terminal', icon: '💻', label: 'Host Terminal' },
  { kind: 'system', icon: '⚙️', label: 'System' },
  { kind: 'settings', icon: '🔧', label: 'Settings' },
  { kind: 'users', icon: '👥', label: 'Users' },
  { kind: 'database', icon: '🗄️', label: 'Database' },
  { kind: 'system-logs', icon: '📜', label: 'System Logs' },
  { kind: 'file-manager', icon: '📁', label: 'Explorer' },
  { kind: 'file-editor', icon: '📝', label: 'Code Editor' },
  { kind: 'changelog', icon: '🔔', label: 'Changelog' },
]

const NON_ADMIN_HIDDEN_KINDS = new Set<WindowKind>(['host-terminal', 'users'])

type DockMenuState = {
  x: number
  y: number
  kind: WindowKind
} | null

const CONTEXT_MENU_WIDTH = 178
const CONTEXT_MENU_ESTIMATED_HEIGHT = 108
const menuButtonClass = 'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition'

export function Dock() {
  const { openWindow, focusWindow, closeWindow, toggleDockAutoHide, closeWindowsByKind } = useWindowStore()
  const autoHideDock = useWindowStore(selectAutoHideDock)
  const focusedId = useWindowStore(selectFocusedId)
  const windows = useWindowStore(selectWindows)
  const themeMode = useThemeStore((state) => state.mode)
  const isDark = themeMode === 'dark'
  const meRaw = typeof window !== 'undefined' ? window.localStorage.getItem('me-v2-cache') : null
  const me = meRaw ? JSON.parse(meRaw) as { role?: string } : null
  const isAdmin = me?.role === 'admin' || me?.role === 'superadmin'

  const [hovered, setHovered] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [menu, setMenu] = useState<DockMenuState>(null)
  const [previewKind, setPreviewKind] = useState<WindowKind | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const previewCloseTimerRef = useRef<number | null>(null)
  const dockHideTimerRef = useRef<number | null>(null)

  const groupedWindows = useMemo(() => {
    return DOCK_ITEMS.reduce<Record<WindowKind, WindowState[]>>((acc, item) => {
      acc[item.kind] = windows.filter((windowItem: WindowState) => windowItem.kind === item.kind)
      return acc
    }, {
      apps: [],
      terminal: [],
      'host-terminal': [],
      system: [],
      'system-logs': [],
      docs: [],
      changelog: [],
      portainer: [],
      settings: [],
      database: [],
      trash: [],
      'file-manager': [],
      'file-editor': [],
      users: [],
      projects: [],
      tunnels: [],
      profile: [],
    })
  }, [windows])

  const visibleDockItems = useMemo(
    () => DOCK_ITEMS
      .filter((item) => isAdmin || !NON_ADMIN_HIDDEN_KINDS.has(item.kind))
      .filter((item) => groupedWindows[item.kind].length > 0),
    [groupedWindows, isAdmin],
  )
  const openKinds = useMemo(() => [...new Set(windows.map((windowItem) => windowItem.kind))], [windows])
  const hasMaximizedWindow = useMemo(
    () => windows.some((windowItem) => !windowItem.isMinimized && windowItem.isMaximized),
    [windows],
  )
  const hasFullscreenWindow = useMemo(
    () => windows.some((windowItem) => !windowItem.isMinimized && windowItem.isFullscreen),
    [windows],
  )
  const hasExpandedWindow = hasMaximizedWindow || hasFullscreenWindow
  // When any window is maximized/fullscreen, force auto-hide (dock slides away)
  // but do NOT fully remove it — the reveal handle must remain so user can pull it back
  const forceAutoHideDock = autoHideDock || hasExpandedWindow
  const isDockForcedHidden = false // never fully hide — always allow reveal trigger

  useEffect(() => {
    const handleClickAway = () => setMenu(null)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null)
        setPreviewKind(null)
      }
    }

    window.addEventListener('click', handleClickAway)
    window.addEventListener('contextmenu', handleClickAway)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('click', handleClickAway)
      window.removeEventListener('contextmenu', handleClickAway)
      window.removeEventListener('keydown', handleEscape)
      if (previewCloseTimerRef.current) window.clearTimeout(previewCloseTimerRef.current)
      if (dockHideTimerRef.current) window.clearTimeout(dockHideTimerRef.current)
    }
  }, [])

  const clearDockHideTimer = () => {
    if (dockHideTimerRef.current) {
      window.clearTimeout(dockHideTimerRef.current)
      dockHideTimerRef.current = null
    }
  }

  const revealDock = () => {
    clearDockHideTimer()
    setRevealed(true)
  }

  const scheduleDockHide = () => {
    clearDockHideTimer()
    if (!forceAutoHideDock || isDockForcedHidden) return
    dockHideTimerRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement
      const dockContainsFocus = !!(dockRef.current && activeElement instanceof Node && dockRef.current.contains(activeElement))
      if (dockContainsFocus) return
      setRevealed(false)
      setHovered(null)
      setPreviewKind(null)
    }, 900)
  }

  const clearPreviewCloseTimer = () => {
    if (previewCloseTimerRef.current) {
      window.clearTimeout(previewCloseTimerRef.current)
      previewCloseTimerRef.current = null
    }
  }

  const schedulePreviewClose = (kind?: WindowKind | null) => {
    clearPreviewCloseTimer()
    previewCloseTimerRef.current = window.setTimeout(() => {
      setPreviewKind((current) => (kind && current !== kind ? current : null))
    }, 220)
  }

  useEffect(() => {
    if (isDockForcedHidden) {
      clearDockHideTimer()
      setHovered(null)
      setPreviewKind(null)
      setRevealed(false)
      return
    }

    if (!visibleDockItems.length) {
      setRevealed(false)
      return
    }

    if (!forceAutoHideDock) {
      setRevealed(true)
      return
    }

    scheduleDockHide()
  }, [forceAutoHideDock, isDockForcedHidden, visibleDockItems.length])

  const dockLayerClass = 'z-[62000]'
  const revealHandleLayerClass = 'z-[61990]'
  const dockSurfaceClass = isDark
    ? 'border-white/10 text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.26)]'
    : 'border-white/55 text-slate-800 shadow-[0_18px_40px_rgba(15,23,42,0.12)]'
  const itemIdleClass = isDark
    ? 'border-white/10 bg-white/8 text-slate-100 shadow-[0_7px_14px_rgba(2,6,23,0.18)]'
    : 'border-white/60 bg-white/72 text-slate-800 shadow-[0_7px_14px_rgba(15,23,42,0.06)]'
  const itemOpenClass = isDark
    ? 'border-sky-400/28 bg-[linear-gradient(180deg,rgba(30,41,59,0.86),rgba(15,23,42,0.86))] text-white shadow-[0_12px_22px_rgba(14,165,233,0.16)]'
    : 'border-sky-300/40 bg-[linear-gradient(180deg,rgba(224, 224, 224, 0.92),rgba(215, 216, 216, 0.82))] text-slate-900 shadow-[0_12px_22px_rgba(59,130,246,0.10)]'
  const tooltipClass = isDark
    ? 'bg-slate-950 text-white shadow-[0_10px_20px_rgba(2,6,23,0.4)]'
    : 'bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.28)]'
  const menuPanelClass = isDark
    ? 'border-white/10 bg-slate-900/96 text-white shadow-[0_14px_28px_rgba(2,6,23,0.36)]'
    : 'border-slate-200/90 bg-white/98 text-slate-900 shadow-[0_14px_28px_rgba(15,23,42,0.16)]'
  const menuButtonToneClass = isDark
    ? 'text-slate-100 hover:bg-sky-500/14 hover:text-white'
    : 'text-slate-700 hover:bg-sky-50 hover:text-slate-900'
  const menuDangerToneClass = isDark
    ? 'text-red-200 hover:bg-red-500/14 hover:text-red-100'
    : 'text-red-600 hover:bg-red-50 hover:text-red-700'
  const menuIconWrapClass = isDark
    ? 'bg-white/8 text-slate-100'
    : 'bg-slate-100 text-slate-700'
  const menuIconActiveClass = isDark
    ? 'bg-emerald-500/16 text-emerald-300'
    : 'bg-emerald-100 text-emerald-700'
  const menuDangerIconClass = isDark
    ? 'bg-red-500/14 text-red-200'
    : 'bg-red-100 text-red-600'
  const isDockVisible = !isDockForcedHidden && (!forceAutoHideDock || revealed)
  const dockTransformClass = isDockForcedHidden
    ? 'translate-y-[calc(100%+24px)] opacity-0'
    : isDockVisible
      ? 'translate-y-0 opacity-100'
      : 'translate-y-[calc(100%+18px)] opacity-100'

  return (
    <>
      {forceAutoHideDock && !isDockForcedHidden && !revealed && visibleDockItems.length > 0 && (
        <button
          id="dock-reveal-handle"
          onMouseEnter={revealDock}
          onFocus={revealDock}
          className={`fixed left-1/2 bottom-2 h-[5px] w-[52px] -translate-x-1/2 rounded-full border-0 transition hover:scale-105 ${!isDark ? 'bg-slate-200/72 shadow-[0_8px_18px_rgba(2,6,23,0.24)]' : 'bg-white/78 shadow-[0_8px_18px_rgba(15,23,42,0.12)]'} ${revealHandleLayerClass}`}
        />
      )}

      <div
        ref={dockRef}
        className={`fixed left-1/2 bottom-[8px] flex -translate-x-1/2 flex-col items-center gap-1.5 transition-[transform,opacity] duration-200 ${dockLayerClass} ${dockTransformClass} ${isDockVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}
        onMouseEnter={() => {
          if (isDockForcedHidden) return
          revealDock()
        }}
        onMouseLeave={() => {
          setHovered(null)
          schedulePreviewClose(null)
          scheduleDockHide()
        }}
      >
        {visibleDockItems.length > 0 && (
          <div
            id="desktop-dock"
            className={`relative flex items-end gap-1.5 rounded-[16px] border px-2 py-1.5 backdrop-blur-[24px] ${dockSurfaceClass}`}
          >
            {visibleDockItems.map((item) => {
              const related = groupedWindows[item.kind]
              const isOpen = openKinds.includes(item.kind)
              const isHovered = hovered === item.kind
              const showPreview = previewKind === item.kind && related.length > 0
              const hasVisible = related.some((windowItem) => !windowItem.isMinimized)

              return (
                <div
                  key={item.kind}
                  className="relative flex cursor-pointer flex-col items-center gap-1"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const nextX = Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 12)
                    const nextY = Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_ESTIMATED_HEIGHT - 12)
                    setMenu({ x: nextX, y: nextY, kind: item.kind })
                    setPreviewKind(null)
                  }}
                  onMouseEnter={() => {
                    clearPreviewCloseTimer()
                    setHovered(item.kind)
                    setPreviewKind(related.length > 0 ? item.kind : null)
                  }}
                  onMouseLeave={() => {
                    setHovered((current) => (current === item.kind ? null : current))
                    if (related.length > 0) schedulePreviewClose(item.kind)
                  }}
                  onClick={() => {
                    const visible = [...related].reverse().find((windowItem) => !windowItem.isMinimized)
                    const minimized = [...related].reverse().find((windowItem) => windowItem.isMinimized)
                    if (visible) {
                      focusWindow(visible.id)
                      return
                    }
                    if (minimized) {
                      focusWindow(minimized.id)
                      return
                    }
                    openWindow(item.kind)
                  }}
                >
                  {showPreview && (
                    <div
                      onMouseEnter={() => {
                        clearPreviewCloseTimer()
                        setPreviewKind(item.kind)
                      }}
                      onMouseLeave={() => schedulePreviewClose(item.kind)}
                      className={`absolute bottom-[60px] left-1/2 z-[62100] flex min-w-[250px] max-w-[340px] max-h-[calc(100vh-112px)] -translate-x-1/2 flex-col gap-2 overflow-hidden rounded-[20px] border p-2 backdrop-blur-xl ${isDark ? 'border-white/14 bg-slate-950/95 shadow-[0_30px_65px_rgba(2,6,23,0.56)]' : 'border-slate-300/60 bg-white/94 shadow-[0_28px_58px_rgba(15,23,42,0.20)]'}`}
                    >
                      <div className={`px-1 pb-1 text-[10px] uppercase tracking-[0.18em] ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                        Open windows · {related.length}
                      </div>
                      <div className="flex max-h-[calc(100vh-154px)] flex-col gap-2 overflow-y-auto pr-1">
                        {related.slice().reverse().map((windowItem: WindowState) => {
                          const active = windowItem.id === focusedId
                          return (
                            <div
                              key={windowItem.id}
                              id={`dock-preview-${windowItem.id.replace(/[^a-z0-9-:]/gi, '-')}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                focusWindow(windowItem.id)
                                setPreviewKind(null)
                              }}
                              className={[
                                'group flex items-center gap-2.5 rounded-[16px] border px-3 py-2.5 transition',
                                active
                                  ? isDark
                                    ? 'border-sky-400/45 bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.18)]'
                                    : 'border-sky-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] text-slate-900 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.28)]'
                                  : isDark
                                    ? 'border-white/8 bg-white/[0.03] text-white hover:border-white/12 hover:bg-white/[0.05]'
                                    : 'border-slate-200/90 bg-slate-50/95 text-slate-800 hover:border-slate-300 hover:bg-white',
                              ].join(' ')}
                            >
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${isDark ? 'bg-white/6' : 'bg-slate-100'}`}>
                                {item.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`truncate text-[11px] font-semibold leading-[1.35] ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{windowItem.title}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className={[
                                    'rounded-full px-2 py-0.5 text-[9px] font-medium',
                                    active
                                      ? isDark
                                        ? 'bg-sky-500/15 text-sky-300'
                                        : 'bg-sky-100 text-sky-700'
                                      : isDark
                                        ? 'bg-white/6 text-slate-300'
                                        : 'bg-slate-200/80 text-slate-600',
                                  ].join(' ')}>
                                    {windowItem.isMinimized ? 'Minimized' : active ? 'Active' : 'Open'}
                                  </span>
                                </div>
                              </div>
                              <button
                                id={`dock-preview-close-${windowItem.id.replace(/[^a-z0-9-:]/gi, '-')}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  closeWindow(windowItem.id)
                                }}
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${isDark ? 'border-white/10 bg-white/6 text-slate-300 hover:border-red-400/30 hover:bg-red-500/12 hover:text-red-200' : 'border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-500'}`}
                                title={`Close ${windowItem.title}`}
                              >
                                <X size={13} strokeWidth={2} />
                              </button>
                            </div>
                          )
                        })}
                      </div>

                    </div>
                  )}

                  {!showPreview && isHovered && (
                    <div className={`pointer-events-none absolute bottom-[49px] whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-medium ${tooltipClass}`}>
                      {item.label}
                    </div>
                  )}

                  <div
                    className={[
                      'flex h-[34px] w-[34px] items-center justify-center rounded-[12px] border text-[15px] transition-all duration-200',
                      isOpen ? itemOpenClass : itemIdleClass,
                      isHovered ? 'scale-[1.08] -translate-y-[4px]' : 'scale-100',
                    ].join(' ')}
                  >
                    {item.icon}
                  </div>

                  <div className="flex min-h-2 items-center gap-1">
                    <div className={[
                      'h-[3px] rounded-full transition-all duration-150',
                      hasVisible ? 'w-3.5 bg-[linear-gradient(90deg,#38bdf8,#6366f1)]' : related.length > 0 ? (isDark ? 'w-2 bg-slate-200/70' : 'w-2 bg-slate-800/80') : (isDark ? 'w-1 bg-slate-500/60' : 'w-1 bg-slate-500/70'),
                      isOpen ? 'opacity-100' : 'opacity-0',
                    ].join(' ')} />
                    {related.length > 1 && <span className={`text-[8px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{related.length}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {menu && (
        <div
          id="dock-context-menu"
          onClick={(event) => event.stopPropagation()}
          className={`fixed z-[62250] w-[178px] rounded-xl border p-1 backdrop-blur-[16px] ${menuPanelClass}`}
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            id="dock-menu-toggle-autohide"
            onClick={() => {
              toggleDockAutoHide()
              setMenu(null)
            }}
            className={`${menuButtonClass} ${menuButtonToneClass}`}
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${autoHideDock ? menuIconActiveClass : menuIconWrapClass}`}>
              {autoHideDock ? <EyeOff size={14} /> : <PanelBottom size={14} />}
            </div>
            <div className="min-w-0 flex-1 truncate">
              {autoHideDock ? 'Disable auto hide' : 'Enable auto hide'}
            </div>
          </button>

          <button
            id="dock-menu-close-group"
            onClick={() => {
              closeWindowsByKind(menu.kind)
              setMenu(null)
            }}
            className={`${menuButtonClass} ${menuDangerToneClass}`}
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${menuDangerIconClass}`}>
              <X size={14} />
            </div>
            <div className="min-w-0 flex-1 truncate">
              Close all windows
            </div>
          </button>
        </div>
      )}
    </>
  )
}
