import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useWindowStore, selectAutoHideDock, selectFocusedId, selectWindows } from '@/store/windowStore'
import type { WindowKind, WindowState } from '@/types'

const DOCK_ITEMS: { kind: WindowKind; icon: string; label: string }[] = [
  { kind: 'apps', icon: '📁', label: 'My Apps' },
  { kind: 'portainer', icon: '🐋', label: 'Portainer' },
  { kind: 'host-terminal', icon: '💻', label: 'Host Terminal' },
  { kind: 'system', icon: '⚙️', label: 'System' },
  { kind: 'docs', icon: '📚', label: 'Docs' },
]

type DockMenuState = {
  x: number
  y: number
} | null

export function Dock() {
  const { openWindow, focusWindow, closeWindow, toggleDockAutoHide } = useWindowStore()
  const autoHideDock = useWindowStore(selectAutoHideDock)
  const focusedId = useWindowStore(selectFocusedId)
  const windows = useWindowStore(selectWindows)

  const [hovered, setHovered] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [menu, setMenu] = useState<DockMenuState>(null)
  const [previewKind, setPreviewKind] = useState<WindowKind | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const previewCloseTimerRef = useRef<number | null>(null)

  const groupedWindows = useMemo(() => {
    return DOCK_ITEMS.reduce<Record<WindowKind, WindowState[]>>((acc, item) => {
      acc[item.kind] = windows.filter((windowItem) => windowItem.kind === item.kind)
      return acc
    }, {
      apps: [],
      terminal: [],
      'host-terminal': [],
      system: [],
      docs: [],
      changelog: [],
      portainer: [],
      settings: [],
      trash: [],
    })
  }, [windows])

  const openKinds = useMemo(() => [...new Set(windows.map((windowItem) => windowItem.kind))], [windows])
  const hiddenOffset = autoHideDock && !revealed ? 72 : 0

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
      if (previewCloseTimerRef.current) {
        window.clearTimeout(previewCloseTimerRef.current)
      }
    }
  }, [])

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

  return (
    <>
      <div
        ref={dockRef}
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 14 - hiddenOffset,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 9999,
          transition: 'bottom 220ms ease',
        }}
        onMouseEnter={() => setRevealed(true)}
        onMouseLeave={() => {
          setRevealed(false)
          setHovered(null)
          schedulePreviewClose(null)
        }}
      >
        {autoHideDock && !revealed && (
          <button
            id="dock-reveal-handle"
            onClick={() => setRevealed(true)}
            style={{
              width: 72,
              height: 8,
              borderRadius: 999,
              border: 'none',
              background: 'rgba(255,255,255,0.82)',
              boxShadow: '0 8px 18px rgba(15,23,42,0.08)',
              cursor: 'pointer',
            }}
          />
        )}

        <div
          id="desktop-dock"
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({ x: event.clientX, y: event.clientY })
            setPreviewKind(null)
          }}
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.78)',
            borderRadius: 22,
            padding: '10px 14px',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            boxShadow: '0 20px 40px rgba(15,23,42,0.10)',
            position: 'relative',
          }}
        >
          {DOCK_ITEMS.map((item) => {
            const related = groupedWindows[item.kind]
            const isOpen = openKinds.includes(item.kind)
            const isHovered = hovered === item.kind
            const showPreview = previewKind === item.kind && related.length > 0
            const hasVisible = related.some((windowItem) => !windowItem.isMinimized)

            return (
              <div
                key={item.kind}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', position: 'relative' }}
                onMouseEnter={() => {
                  clearPreviewCloseTimer()
                  setHovered(item.kind)
                  setPreviewKind(related.length > 0 ? item.kind : null)
                }}
                onMouseLeave={() => {
                  setHovered((current) => (current === item.kind ? null : current))
                  if (related.length > 0) {
                    schedulePreviewClose(item.kind)
                  }
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
                    style={{
                      position: 'absolute',
                      bottom: 84,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: 10,
                      borderRadius: 18,
                      background: 'rgba(15,23,42,0.96)',
                      border: '1px solid rgba(148,163,184,0.20)',
                      boxShadow: '0 26px 60px rgba(2,6,23,0.38)',
                      minWidth: 260,
                      maxWidth: 340,
                    }}
                  >
                    {related.slice().reverse().map((windowItem) => {
                      const active = windowItem.id === focusedId
                      // const itemKey = windowItem.id.split(':').pop() ?? windowItem.id
                      return (
                        <div
                          key={windowItem.id}
                          id={`dock-preview-${windowItem.id.replace(/[^a-z0-9-:]/gi, '-')}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            focusWindow(windowItem.id)
                            setPreviewKind(null)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            borderRadius: 14,
                            border: `1px solid ${active ? 'rgba(96,165,250,0.55)' : 'rgba(148,163,184,0.18)'}`,
                            background: active ? 'rgba(30,41,59,0.98)' : 'rgba(15,23,42,0.82)',
                            padding: '10px 12px',
                            color: '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
                              {windowItem.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                              {/* <span style={{ fontSize: 10, color: '#94a3b8' }}>Key: {itemKey}</span> */}
                              <span style={{
                                fontSize: 10,
                                color: active ? '#93c5fd' : '#cbd5e1',
                                padding: '2px 6px',
                                borderRadius: 999,
                                background: active ? 'rgba(59,130,246,0.16)' : 'rgba(255,255,255,0.06)',
                              }}>
                                {windowItem.isMinimized ? 'Minimized' : active ? 'Focused' : 'Open'}
                              </span>
                            </div>
                          </div>
                          <button
                            id={`dock-preview-close-${windowItem.id.replace(/[^a-z0-9-:]/gi, '-')}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              closeWindow(windowItem.id)
                            }}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              border: '1px solid rgba(148,163,184,0.18)',
                              background: 'rgba(255,255,255,0.06)',
                              color: '#cbd5e1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            title={`Close ${windowItem.title}`}
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {!showPreview && isHovered && (
                  <div style={{
                    position: 'absolute',
                    bottom: 66,
                    background: '#0f172a',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '5px 10px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    boxShadow: '0 10px 20px rgba(15,23,42,0.25)',
                  }}>
                    {item.label}
                  </div>
                )}

                <div style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  background: isOpen ? 'linear-gradient(180deg, rgba(255,255,255,1), rgba(241,245,249,0.95))' : '#f8fafc',
                  border: `1px solid ${isOpen ? 'rgba(96,165,250,0.25)' : '#e5e7eb'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  transition: 'transform .18s, box-shadow .18s, border-color .18s',
                  transform: isHovered ? 'scale(1.18) translateY(-7px)' : 'scale(1)',
                  boxShadow: isOpen ? '0 16px 28px rgba(59,130,246,0.12)' : '0 8px 18px rgba(15,23,42,0.05)',
                }}>
                  {item.icon}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 8 }}>
                  <div style={{
                    width: hasVisible ? 20 : related.length > 0 ? 12 : 6,
                    height: 4,
                    borderRadius: 999,
                    background: hasVisible ? 'linear-gradient(90deg, #38bdf8, #6366f1)' : '#0f172a',
                    opacity: isOpen ? 1 : 0,
                    transition: 'opacity .15s, width .15s',
                  }} />
                  {related.length > 1 && (
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{related.length}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {menu && (
        <div
          id="dock-context-menu"
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'fixed',
            left: menu.x,
            top: menu.y,
            zIndex: 10001,
            minWidth: 220,
            borderRadius: 16,
            background: 'rgba(15,23,42,0.96)',
            border: '1px solid rgba(148,163,184,0.18)',
            boxShadow: '0 24px 50px rgba(2,6,23,0.35)',
            padding: 8,
            color: '#fff',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div style={{ padding: '8px 10px', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
            Dock options
          </div>
          <button
            id="dock-menu-toggle-autohide"
            onClick={() => {
              toggleDockAutoHide()
              setMenu(null)
            }}
            style={menuButtonStyle}
          >
            {autoHideDock ? 'Disable auto hide' : 'Enable auto hide'}
          </button>
        </div>
      )}
    </>
  )
}

const menuButtonStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  borderRadius: 12,
  background: 'transparent',
  color: '#fff',
  textAlign: 'left',
  padding: '10px 12px',
  cursor: 'pointer',
  fontSize: 13,
}
