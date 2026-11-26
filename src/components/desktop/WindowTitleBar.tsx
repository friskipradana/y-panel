import { Copy, Maximize, Minimize as ExitFullscreen, Minus, PictureInPicture2, Square, X } from 'lucide-react'
import { AppIcon } from '@/components/common/AppIcon'
import type { WindowState } from '@/types'
import { windowTitleKey } from '@/lib/i18n'

interface WindowTitleBarProps {
  win: WindowState
  isFocused: boolean
  isExpanded: boolean
  isPip: boolean
  canPip: boolean
  t: (key: string, params?: Record<string, string | number>) => string
  onPointerDown: (e: React.PointerEvent) => void
  onDoubleClick: () => void
  onMinimize: () => void
  onMaximize: () => void
  onToggleFullscreen: () => void
  onTogglePip: () => void
  onClose: () => void
}

const controlButtonStyle: React.CSSProperties = {
  width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  color: 'var(--tb-clock)', transition: 'background 120ms ease, color 120ms ease',
}

function applyHover(element: HTMLButtonElement) {
  element.style.background = 'var(--tb-hover)'
  element.style.color = 'var(--win-text)'
}

function resetHover(element: HTMLButtonElement) {
  element.style.background = 'transparent'
  element.style.color = 'var(--tb-clock)'
}

export function WindowTitleBar({
  win,
  isFocused,
  isExpanded,
  isPip,
  canPip,
  t,
  onPointerDown,
  onDoubleClick,
  onMinimize,
  onMaximize,
  onToggleFullscreen,
  onTogglePip,
  onClose,
}: WindowTitleBarProps) {
  const pipTitle = isPip ? t('window.pipExit') : t('window.pipEnter')
  const maxTitle = win.isMaximized ? t('window.restore') : t('window.maximize')
  const fullTitle = win.isFullscreen ? t('window.exitFullscreen') : t('window.fullscreen')

  return (
    <div
      className={`flex items-center justify-between px-3 shrink-0 z-10 transition-colors duration-150 select-none border-b border-[var(--win-border)] ${isPip ? 'window-titlebar--pip' : 'relative'}`}
      style={{ height: isPip ? 32 : 38, background: isFocused ? 'var(--win-bar-focus)' : 'var(--win-bar)', borderBottom: '1px solid var(--win-border)', cursor: isExpanded ? 'default' : 'move' }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-center gap-2 min-w-0 pr-3 pointer-events-none">
        <AppIcon
          kind={win.kind}
          iconKey={typeof win.params?.iconKey === 'string' ? win.params.iconKey : undefined}
          iconColor={typeof win.params?.iconColor === 'string' ? win.params.iconColor : undefined}
          size={16}
        />
        <span className="text-xs font-semibold truncate tracking-tight transition-colors duration-150" style={{ color: isFocused ? 'var(--win-text)' : 'var(--window-title-muted)' }}>
          {win.kind === 'installed-app' && typeof win.params?.appName === 'string' && win.params.appName
            ? win.params.appName
            : t(windowTitleKey(win.kind))}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0" data-window-controls onPointerDown={(e) => e.stopPropagation()}>
        {canPip ? (
          <button
            type="button"
            onClick={onTogglePip}
            style={{ ...controlButtonStyle, color: isPip ? 'var(--panel-primary-text)' : controlButtonStyle.color }}
            onMouseEnter={(e) => applyHover(e.currentTarget)}
            onMouseLeave={(e) => {
              resetHover(e.currentTarget)
              if (isPip) e.currentTarget.style.color = 'var(--panel-primary-text)'
            }}
            title={pipTitle}
            aria-label={pipTitle}
          >
            <PictureInPicture2 size={13} strokeWidth={1.75} />
          </button>
        ) : null}
        {!isPip ? (
          <>
            <button type="button" onClick={onMinimize} style={controlButtonStyle} onMouseEnter={(e) => applyHover(e.currentTarget)} onMouseLeave={(e) => resetHover(e.currentTarget)} title={t('window.minimize')} aria-label={t('window.minimize')}>
              <Minus size={13} strokeWidth={1.75} />
            </button>
            <button type="button" onClick={onMaximize} style={controlButtonStyle} onMouseEnter={(e) => applyHover(e.currentTarget)} onMouseLeave={(e) => resetHover(e.currentTarget)} title={maxTitle} aria-label={maxTitle}>
              {win.isMaximized ? <Copy size={11} strokeWidth={1.75} className="rotate-90" /> : <Square size={11} strokeWidth={1.75} />}
            </button>
            <button type="button" onClick={onToggleFullscreen} style={controlButtonStyle} onMouseEnter={(e) => applyHover(e.currentTarget)} onMouseLeave={(e) => resetHover(e.currentTarget)} title={fullTitle} aria-label={fullTitle}>
              {win.isFullscreen ? <ExitFullscreen size={12} strokeWidth={1.75} /> : <Maximize size={12} strokeWidth={1.75} />}
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          style={controlButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--window-close-hover-bg, #ef4444)'
            e.currentTarget.style.color = 'var(--window-close-hover-text, #ffffff)'
          }}
          onMouseLeave={(e) => resetHover(e.currentTarget)}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
