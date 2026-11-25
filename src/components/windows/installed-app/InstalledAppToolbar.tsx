import { useEffect, useRef, useState, type ComponentProps } from 'react'
import {
  ExternalLink,
  PanelTopClose,
  PanelTopOpen,
  PictureInPicture2,
  RefreshCw,
  Scan,
} from 'lucide-react'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { useI18n } from '@/lib/i18n'

interface InstalledAppToolbarProps {
  statusTone: ComponentProps<typeof Badge>['tone']
  statusLabel: string
  endpointLabel: string
  isMobile: boolean
  isPip: boolean
  isFullscreen: boolean
  autoHide: boolean
  isFetching?: boolean
  menuLoading?: boolean
  overflowActions?: ActionMenuItem[]
  onToggleAutoHide: () => void
  onFitToContent: () => void
  onTogglePip: () => void
  onRefresh: () => void
  onOpenNewTab: () => void
}

export function InstalledAppToolbar({
  statusTone,
  statusLabel,
  endpointLabel,
  isMobile,
  isPip,
  isFullscreen,
  autoHide,
  isFetching = false,
  menuLoading = false,
  overflowActions,
  onToggleAutoHide,
  onFitToContent,
  onTogglePip,
  onRefresh,
  onOpenNewTab,
}: InstalledAppToolbarProps) {
  const { t } = useI18n()
  const [revealed, setRevealed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const hideTimerRef = useRef<number | null>(null)

  const overlayMode = !isMobile && (autoHide || isPip || isFullscreen)

  const clearTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const revealNow = () => {
    clearTimer()
    setRevealed(true)
  }

  const scheduleHide = () => {
    if (menuOpen) return
    clearTimer()
    hideTimerRef.current = window.setTimeout(() => {
      setRevealed(false)
      hideTimerRef.current = null
    }, 240)
  }

  useEffect(() => clearTimer, [])

  const isVisible = !overlayMode || revealed || menuOpen

  if (isPip) return null

  return (
    <>
      {overlayMode ? (
        <div
          className="installed-app-hoverzone"
          onMouseEnter={revealNow}
          onClick={revealNow}
          title={t('appCatalog.showToolbar')}
        >
          <span className="installed-app-hoverzone__pill" aria-hidden="true" />
        </div>
      ) : null}

      <div
        className={`installed-app-toolbar ${isMobile ? 'installed-app-toolbar--mobile' : ''} ${
          overlayMode ? 'installed-app-toolbar--overlay' : ''
        } ${overlayMode && isVisible ? 'installed-app-toolbar--revealed' : ''}`}
        onMouseEnter={overlayMode ? revealNow : undefined}
        onMouseLeave={overlayMode ? scheduleHide : undefined}
      >
        <div className="installed-app-toolbar__meta">
          <Badge tone={statusTone} size="sm" dot>
            {statusLabel}
          </Badge>
          <span className="installed-app-endpoint panel-mono" title={endpointLabel}>
            {endpointLabel}
          </span>
        </div>

        <div className="installed-app-toolbar__actions">
          {!isMobile ? (
            <>
              <IconButton label={t('appCatalog.fitToContent')} onClick={onFitToContent}>
                <Scan className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>

              <IconButton
                label={isPip ? t('window.pipExit') : t('window.pipEnter')}
                className={isPip ? 'text-[var(--panel-primary-text)]' : ''}
                onClick={onTogglePip}
              >
                <PictureInPicture2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>

              <IconButton
                label={autoHide ? t('appCatalog.showToolbar') : t('appCatalog.autoHideToolbar')}
                className={autoHide ? 'text-[var(--panel-primary-text)]' : ''}
                onClick={() => {
                  onToggleAutoHide()
                  setRevealed(false)
                }}
              >
                {autoHide ? (
                  <PanelTopOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <PanelTopClose className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </IconButton>

              <span className="installed-app-toolbar__sep" aria-hidden="true" />
            </>
          ) : null}

          <IconButton label={t('common.refresh')} onClick={onRefresh}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </IconButton>

          <IconButton label={t('appCatalog.openNewTab')} onClick={onOpenNewTab}>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>

          {overflowActions && overflowActions.length > 0 ? (
            <ActionMenu
              label={t('common.moreActions')}
              items={overflowActions}
              loading={menuLoading}
              onOpenChange={(open) => {
                setMenuOpen(open)
                if (open) revealNow()
                else if (overlayMode) scheduleHide()
              }}
            />
          ) : null}
        </div>
      </div>
    </>
  )
}
