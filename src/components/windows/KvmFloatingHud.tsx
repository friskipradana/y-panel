import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Monitor,
  Pin,
  PinOff,
  RefreshCw,
} from 'lucide-react'
import type { KvmQualityMode } from '@/api/kvm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { KVM_QUALITY_PRESETS } from './kvmHelpers'

interface KvmFloatingHudProps {
  connState: 'connecting' | 'connected' | 'disconnected'
  expanded: boolean
  pinned: boolean
  scaleToFit: boolean
  isFullscreen: boolean
  qualityMode: KvmQualityMode
  resolution: string
  resolutionOptions: Array<{ value: string; label: string }>
  resolvingResolution: boolean
  onExpand: () => void
  onCollapse: () => void
  onTogglePin: () => void
  onHoverChange: (hovering: boolean) => void
  onQualityModeChange: (mode: KvmQualityMode) => void
  onResolutionChange: (resolution: string) => void
  onToggleScale: () => void
  onSendCad: () => void
  onSendSuper: () => void
  onReconnect: () => void
  onToggleFullscreen: () => void
  onBack?: () => void
}

export function KvmFloatingHud({
  connState,
  expanded,
  pinned,
  scaleToFit,
  isFullscreen,
  qualityMode,
  resolution,
  resolutionOptions,
  resolvingResolution,
  onExpand,
  onCollapse,
  onTogglePin,
  onHoverChange,
  onQualityModeChange,
  onResolutionChange,
  onToggleScale,
  onSendCad,
  onSendSuper,
  onReconnect,
  onToggleFullscreen,
  onBack,
}: KvmFloatingHudProps) {
  const { t } = useI18n()

  const qualityOptions = (Object.keys(KVM_QUALITY_PRESETS) as KvmQualityMode[]).map((key) => ({
    value: key,
    label: t(KVM_QUALITY_PRESETS[key].labelKey),
  }))

  const statusText =
    connState === 'connected'
      ? t('kvm.connected')
      : connState === 'connecting'
        ? t('kvm.connecting')
        : t('kvm.disconnected')

  const dotClass =
    connState === 'connected'
      ? 'kvm-status-dot kvm-status-dot--online'
      : connState === 'connecting'
        ? 'kvm-status-dot kvm-status-dot--busy kvm-status-dot--pulse'
        : 'kvm-status-dot'

  if (!expanded) {
    return (
      <div className="kvm-hud">
        <button
          type="button"
          className="kvm-hud__tab"
          onClick={onExpand}
          aria-label={t('kvm.showControls')}
          title={t('kvm.showControls')}
        >
          <span className={dotClass} />
          <span>{t(KVM_QUALITY_PRESETS[qualityMode].labelKey)}</span>
          <span className="panel-mono text-[11px] text-[var(--text-secondary)]">{resolution}</span>
          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="kvm-hud"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <div className="kvm-hud__bar">
        <span className="kvm-status-badge">
          <span className={dotClass} />
          <span>{statusText}</span>
        </span>

        <div className="kvm-hud__divider" />

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
          value={resolution}
          onChange={onResolutionChange}
          options={resolutionOptions}
          disabled={resolvingResolution}
          placeholder={t('kvm.resolutionLabel')}
          buttonClassName="kvm-hud__select kvm-hud__select--mono"
          dropdownWidth={148}
        />

        <div className="kvm-hud__divider" />

        <Button
          variant="outline"
          size="sm"
          className="kvm-key-btn"
          disabled={connState !== 'connected'}
          onClick={onSendCad}
          title={t('kvm.cad')}
          aria-label={t('kvm.cad')}
        >
          {t('kvm.cadShort')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="kvm-key-btn"
          disabled={connState !== 'connected'}
          onClick={onSendSuper}
          title={t('kvm.superKey')}
          aria-label={t('kvm.superKey')}
        >
          {t('kvm.superShort')}
        </Button>

        <div className="kvm-hud__divider" />

        <IconButton
          tone={scaleToFit ? 'primary' : 'default'}
          className={scaleToFit ? 'kvm-icon-btn--active' : ''}
          label={t('kvm.scale')}
          aria-pressed={scaleToFit}
          onClick={onToggleScale}
        >
          <Monitor className="h-3.5 w-3.5" />
        </IconButton>

        <IconButton label={t('kvm.reconnect')} disabled={connState === 'connecting'} onClick={onReconnect}>
          <RefreshCw className={`h-3.5 w-3.5 ${connState === 'connecting' ? 'animate-spin' : ''}`} />
        </IconButton>

        <IconButton label={t('kvm.fullscreen')} aria-pressed={isFullscreen} onClick={onToggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </IconButton>

        <IconButton
          tone={pinned ? 'primary' : 'default'}
          className={pinned ? 'kvm-icon-btn--active' : ''}
          label={pinned ? t('kvm.hideControls') : t('kvm.showControls')}
          aria-pressed={pinned}
          onClick={onTogglePin}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </IconButton>

        {onBack ? (
          <>
            <div className="kvm-hud__divider" />
            <Button
              variant="outline"
              size="sm"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={onBack}
              title={t('kvm.backToPanel')}
              aria-label={t('kvm.backToPanel')}
            >
              {t('kvm.backShort')}
            </Button>
          </>
        ) : null}

        <IconButton label={t('kvm.hideControls')} onClick={onCollapse}>
          <ChevronUp className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}
