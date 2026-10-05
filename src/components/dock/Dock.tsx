import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EyeOff, PanelBottom, X } from 'lucide-react'
import { useWindowStore, selectAutoHideDock, selectFocusedId, selectWindows } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { AppIcon } from '@/components/common/AppIcon'
import type { WindowKind, WindowState } from '@/types'
import { useI18n, windowTitleKey } from '@/lib/i18n'

const DOCK_ITEMS: { kind: WindowKind; label: string }[] = [
  { kind: 'apps', label: 'Docker' },
  { kind: 'projects', label: 'Projects' },
  { kind: 'tunnels', label: 'Cloudflare' },
  { kind: 'profile', label: 'Profile' },
  { kind: 'host-terminal', label: 'Host Terminal' },
  { kind: 'system', label: 'System' },
  { kind: 'settings', label: 'Settings' },
  { kind: 'users', label: 'Users' },
  { kind: 'database', label: 'Database' },
  { kind: 'system-logs', label: 'System Logs' },
  { kind: 'file-manager', label: 'Files' },
  { kind: 'file-editor', label: 'Code Editor' },
  { kind: 'docs', label: 'Docs' },
  { kind: 'changelog', label: 'Changelog' },
]

const NON_ADMIN_HIDDEN_KINDS = new Set<WindowKind>(['host-terminal', 'users', 'settings', 'database', 'system-logs'])

type DockMenuState = {
  x: number
  y: number
  kind: WindowKind
} | null

const CONTEXT_MENU_WIDTH = 178
const CONTEXT_MENU_ESTIMATED_HEIGHT = 108
const menuButtonClass = 'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition cursor-pointer'

export function Dock() {
  const { t } = useI18n()
  const { openWindow, focusWindow, minimizeWindow, toggleDockAutoHide, closeWindowsByKind } = useWindowStore()
  const autoHideDock = useWindowStore(selectAutoHideDock)
  const focusedId = useWindowStore(selectFocusedId)
  const windows = useWindowStore(selectWindows)
  const desktopIconStyle = useThemeStore((state) => state.desktopIconStyle)
  const meRaw = typeof window !== 'undefined' ? window.localStorage.getItem('me-v2-cache') : null
  const me = meRaw ? JSON.parse(meRaw) as { role?: string } : null
  const isAdmin = me?.role === 'admin' || me?.role === 'superadmin'

  const [hovered, setHovered] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [menu, setMenu] = useState<DockMenuState>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
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
  const forceAutoHideDock = autoHideDock || hasExpandedWindow

  useEffect(() => {
    const handleClickAway = () => setMenu(null)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }

    window.addEventListener('click', handleClickAway)
    window.addEventListener('contextmenu', handleClickAway)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('click', handleClickAway)
      window.removeEventListener('contextmenu', handleClickAway)
      window.removeEventListener('keydown', handleEscape)
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
    if (!forceAutoHideDock) return
    dockHideTimerRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement
      const dockContainsFocus = !!(dockRef.current && activeElement instanceof Node && dockRef.current.contains(activeElement))
      if (dockContainsFocus) return
      setRevealed(false)
      setHovered(null)
    }, 900)
  }

  useEffect(() => {
    if (!visibleDockItems.length) {
      setRevealed(false)
      return
    }

    if (!forceAutoHideDock) {
      setRevealed(true)
      return
    }

    scheduleDockHide()
  }, [forceAutoHideDock, visibleDockItems.length])

  const dockLayerClass = 'z-[62000]'
  const revealHandleLayerClass = 'z-[61990]'
  const dockSurfaceClass = 'border-[var(--win-border)] text-[var(--dock-surface-text)] shadow-[var(--dock-surface-shadow)]'
  const itemIdleClass = 'border-[var(--win-border)] bg-[var(--dock-item-idle-bg)] text-[var(--dock-item-idle-text)] shadow-[var(--dock-item-idle-shadow)]'
  const itemOpenClass = 'border-[var(--dock-item-open-border)] bg-[var(--dock-item-open-bg)] text-[var(--win-text)] shadow-[var(--dock-item-open-shadow)]'
  const tooltipClass = 'bg-[var(--dock-tooltip-bg)] text-[var(--win-text)] shadow-[var(--dock-tooltip-shadow)]'
  const menuPanelClass = 'border-[var(--dock-menu-border)] bg-[var(--dock-menu-bg)] text-[var(--dock-surface-text)] shadow-[var(--dock-menu-shadow)]'
  const menuButtonToneClass = 'text-[var(--dock-surface-text)] hover:bg-[var(--panel-primary-bg)] hover:text-[var(--win-text)]'
  const menuDangerToneClass = 'text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-bg)] hover:text-[var(--panel-danger-text)]'
  const menuIconWrapClass = 'bg-[var(--dock-menu-icon-bg)] text-[var(--dock-surface-text)]'
  const menuIconActiveClass = 'bg-[var(--dock-menu-active-icon-bg)] text-[var(--panel-success-text)]'
  const menuDangerIconClass = 'bg-[var(--dock-menu-danger-icon-bg)] text-[var(--panel-danger-text)]'
  const isDockVisible = !forceAutoHideDock || revealed
  const dockTransformClass = isDockVisible
    ? 'translate-y-0 opacity-100'
    : 'translate-y-[calc(100%+18px)] opacity-100'

  return (
    <>
      {forceAutoHideDock && !revealed && visibleDockItems.length > 0 && (
        <button
          id="dock-reveal-handle"
          onMouseEnter={revealDock}
          onFocus={revealDock}
          className={`fixed left-1/2 bottom-2 h-[5px] w-[52px] -translate-x-1/2 rounded-full border-0 bg-[var(--dock-reveal-bg)] shadow-[var(--dock-reveal-shadow)] transition hover:scale-105 ${revealHandleLayerClass}`}
        />
      )}

      <div
        ref={dockRef}
        className={`fixed left-1/2 bottom-[8px] flex -translate-x-1/2 flex-col items-center gap-1.5 transition-[transform,opacity] duration-200 ${dockLayerClass} ${dockTransformClass} ${isDockVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}
        onMouseEnter={revealDock}
        onMouseLeave={() => {
          setHovered(null)
          scheduleDockHide()
        }}
      >
        {visibleDockItems.length > 0 && (
          <motion.div
            layout
            id="desktop-dock"
            className={`relative flex items-end gap-2.5 rounded-2xl border px-3.5 py-2 backdrop-blur-[24px] ${dockSurfaceClass}`}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatePresence mode="popLayout">
              {visibleDockItems.map((item) => {
                const related = groupedWindows[item.kind]
                const isOpen = openKinds.includes(item.kind)
                const isHovered = hovered === item.kind
                const isFocused = related.some((w) => w.id === focusedId && !w.isMinimized)
                const allMinimized = related.length > 0 && related.every((w) => w.isMinimized)
                const hasVisible = related.some((w) => !w.isMinimized)

                return (
                  <motion.div
                    key={item.kind}
                    layout
                    initial={{ opacity: 0, scale: 0.7, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.7, y: 6 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="relative flex cursor-pointer flex-col items-center select-none"
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      const nextX = Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 12)
                      const nextY = Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_ESTIMATED_HEIGHT - 12)
                      setMenu({ x: nextX, y: nextY, kind: item.kind })
                    }}
                    onMouseEnter={() => setHovered(item.kind)}
                    onMouseLeave={() => setHovered((current) => (current === item.kind ? null : current))}
                    onClick={() => {
                      const visible = [...related].reverse().find((windowItem) => !windowItem.isMinimized)
                      const minimized = [...related].reverse().find((windowItem) => windowItem.isMinimized)
                      const isCurrentlyActive = visible && visible.id === focusedId

                      if (isCurrentlyActive) {
                        // Click on already-focused window minimizes it
                        minimizeWindow(visible.id)
                        return
                      }
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
                    {/* Clean desktop floating tooltip */}
                    <AnimatePresence>
                      {isHovered && (
                        <motion.div
                          initial={{ opacity: 0, y: 4, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.92 }}
                          transition={{ duration: 0.12 }}
                          className={`pointer-events-none absolute bottom-full mb-2.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide border border-white/10 ${tooltipClass}`}
                        >
                          {t(windowTitleKey(item.kind))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Icon Tile with tactile Desktop spring feedback */}
                    <motion.div
                      whileHover={{ scale: 1.1, y: -2 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                      className={[
                        'flex h-[38px] w-[38px] items-center justify-center rounded-xl cursor-pointer',
                        desktopIconStyle === 'plain'
                          ? 'hover:bg-white/10'
                          : isFocused
                            ? 'border border-[var(--panel-primary-solid)] bg-black/30 backdrop-blur-md shadow-md shadow-black/25'
                            : isOpen
                              ? itemOpenClass
                              : itemIdleClass,
                      ].join(' ')}
                    >
                      <AppIcon kind={item.kind} size={22} />
                    </motion.div>

                    {/* Status Indicator Dot */}
                    <div className="flex min-h-[6px] items-center justify-center gap-1 mt-1">
                      {isFocused ? (
                        <div className="h-[3px] w-3.5 rounded-full bg-[var(--panel-primary-solid)] shadow-[0_0_8px_rgba(56,189,248,0.6)] transition-all duration-150" />
                      ) : hasVisible ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--panel-primary-solid)] opacity-90 transition-all duration-150" />
                      ) : allMinimized ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)] transition-all duration-150" />
                      ) : isOpen ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--dock-indicator-visible-bg)] opacity-70 transition-all duration-150" />
                      ) : null}
                      {related.length > 1 && (
                        <span className="text-[9px] font-bold text-[var(--text-secondary)] font-mono leading-none">
                          {related.length}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </motion.div>
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
              {autoHideDock ? t('dock.disableAutoHide') : t('dock.enableAutoHide')}
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
              {t('common.closeAll')}
            </div>
          </button>
        </div>
      )}
    </>
  )
}
