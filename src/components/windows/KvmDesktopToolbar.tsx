import { ExternalLink, Maximize2, Minimize2, Power, RefreshCw, Scale } from 'lucide-react'
import { toast } from 'sonner'
import type { KvmQualityMode } from '@/api/kvm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { launchTokenizedKvmTab } from './kvmHelpers'

interface KvmDesktopToolbarProps {
  connected: boolean
  connecting: boolean
  display: string
  connectionError: string | null
  qualityMode: KvmQualityMode
  qualityOptions: Array<{ value: string; label: string }>
  currentResolution: string
  resolutionOptions: Array<{ value: string; label: string }>
  resolvingResolution: boolean
  scaleToFit: boolean
  hasWindow: boolean
  isFullscreen: boolean
  t: (key: string) => string
  onQualityModeChange: (mode: KvmQualityMode) => void
  onResolutionChange: (nextRes: string) => void
  onSendCad: () => void
  onSendSuper: () => void
  onToggleScale: () => void
  onDisconnect: () => void
  onReconnect: () => void
  onToggleFullscreen: () => void
}

export function KvmDesktopToolbar({
  connected,
  connecting,
  display,
  connectionError,
  qualityMode,
  qualityOptions,
  currentResolution,
  resolutionOptions,
  resolvingResolution,
  scaleToFit,
  hasWindow,
  isFullscreen,
  t,
  onQualityModeChange,
  onResolutionChange,
  onSendCad,
  onSendSuper,
  onToggleScale,
  onDisconnect,
  onReconnect,
  onToggleFullscreen,
}: KvmDesktopToolbarProps) {
  return (
    <div className="kvm-toolbar flex-wrap">
      <div className="kvm-toolbar__group">
        <div className="kvm-status-badge">
          <span
            className={`kvm-status-dot ${
              connected
                ? 'kvm-status-dot--online'
                : connecting
                  ? 'kvm-status-dot--busy kvm-status-dot--pulse'
                  : ''
            }`}
          />
          <span>{connected ? t('kvm.connected') : connecting ? t('kvm.connecting') : t('kvm.disconnected')}</span>
          <span className="font-mono text-[10px] text-[var(--text-secondary)]">({display})</span>
        </div>

        {connectionError ? (
          <span className="text-[11px] text-[var(--panel-danger-text)] font-medium truncate max-w-[200px]" title={connectionError}>
            {connectionError}
          </span>
        ) : null}
      </div>

      <div className="kvm-toolbar__group flex-wrap">
        <Select
          size="sm"
          value={qualityMode}
          onChange={(val) => onQualityModeChange(val as KvmQualityMode)}
          options={qualityOptions}
          placeholder={t('kvm.modeLabel')}
          buttonClassName="kvm-hud__select"
          dropdownWidth={168}
        />
        <Select
          size="sm"
          value={currentResolution}
          onChange={onResolutionChange}
          options={resolutionOptions}
          disabled={resolvingResolution}
          placeholder={t('kvm.resolutionLabel')}
          buttonClassName="kvm-hud__select kvm-hud__select--mono"
          dropdownWidth={148}
        />
        <Button size="sm" variant="outline" className="kvm-key-btn" disabled={!connected} onClick={onSendCad} title={t('kvm.cad')} aria-label={t('kvm.cad')}>
          {t('kvm.cadShort')}
        </Button>
        <Button size="sm" variant="outline" className="kvm-key-btn" disabled={!connected} onClick={onSendSuper} title={t('kvm.superKey')} aria-label={t('kvm.superKey')}>
          {t('kvm.superShort')}
        </Button>
        <div className="kvm-toolbar__divider" />
        <IconButton
          tone={scaleToFit ? 'primary' : 'default'}
          className={scaleToFit ? 'kvm-icon-btn--active' : ''}
          label={t('kvm.scale')}
          aria-pressed={scaleToFit}
          onClick={onToggleScale}
        >
          <Scale className="h-3.5 w-3.5" />
        </IconButton>
        {connected ? (
          <IconButton tone="danger" label={t('kvm.disconnect')} onClick={onDisconnect}>
            <Power className="h-3.5 w-3.5" />
          </IconButton>
        ) : (
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className={`h-3 w-3 ${connecting ? 'animate-spin' : ''}`} />}
            disabled={connecting}
            onClick={onReconnect}
            title={t('kvm.reconnect')}
            aria-label={t('kvm.reconnect')}
          >
            {t('kvm.reconnect')}
          </Button>
        )}
        <IconButton
          label={t('kvm.openInNewTab')}
          onClick={() =>
            void launchTokenizedKvmTab(
              () => toast.error(t('kvm.popupBlocked')),
              (msg) => toast.error(msg),
              t('kvm.tokenFailed'),
            )
          }
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </IconButton>
        {hasWindow ? (
          <IconButton label={t('kvm.fullscreen')} aria-pressed={isFullscreen} onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconButton>
        ) : null}
      </div>
    </div>
  )
}
