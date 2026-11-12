import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import RFB from '@novnc/novnc'
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorOff,
  Play,
  Power,
  RefreshCw,
  Scale,
  Settings,
  ShieldAlert,
  Terminal,
} from 'lucide-react'
import { toast } from 'sonner'
import { createKvmToken, getKvmStatus, installKvm, resolveKvmWsUrl, setKvmResolution, startKvm, type KvmQualityMode } from '@/api/kvm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'
import { KvmFloatingHud } from './KvmFloatingHud'
import {
  applyRfbQualityPreset,
  extractKvmErrorMessage,
  KVM_QUALITY_PRESETS,
  KVM_RESOLUTION_VALUES,
  launchTokenizedKvmTab,
  readStoredKvmQualityMode,
  writeStoredKvmQualityMode,
} from './kvmHelpers'

export interface KvmWindowProps {
  win?: WindowState
  authenticated?: boolean
  standalone?: boolean
  accessToken?: string
  onBack?: () => void
}

export function KvmWindow({ win, authenticated, standalone, accessToken, onBack }: KvmWindowProps) {
  const { t } = useI18n()
  const openWindow = useWindowStore((s) => s.openWindow)
  const toggleFullscreen = useWindowStore((s) => s.toggleFullscreenWindow)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const rfbRef = useRef<RFB | null>(null)

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [scaleToFit, setScaleToFit] = useState(true)
  const [copied, setCopied] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [qualityMode, setQualityMode] = useState<KvmQualityMode>(() => readStoredKvmQualityMode())
  const [hudExpanded, setHudExpanded] = useState(true)
  const [hudPinned, setHudPinned] = useState(false)
  const [hudHovered, setHudHovered] = useState(false)
  const desktopTokenRef = useRef<string | null>(null)
  const tokenFailedRef = useRef(false)
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  )

  useEffect(() => {
    const handler = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
    }
  }, [])

  const handleToggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {})
    } else {
      void document.exitFullscreen().catch(() => {})
    }
  }

  const qc = useQueryClient()
  const scaleToFitRef = useRef(scaleToFit)
  const qualityModeRef = useRef(qualityMode)
  const connStateRef = useRef({ connected, connecting })
  useEffect(() => {
    scaleToFitRef.current = scaleToFit
    qualityModeRef.current = qualityMode
    connStateRef.current = { connected, connecting }
  }, [scaleToFit, qualityMode, connected, connecting])

  const { data: status, isLoading, isError: isStatusError, refetch } = useQuery({
    queryKey: ['kvm-status', standalone ? accessToken ?? '' : 'desktop'],
    queryFn: () => getKvmStatus(standalone ? accessToken : undefined),
    enabled: authenticated !== false && (!standalone || Boolean(accessToken)),
    retry: 1,
  })

  const [actionError, setActionError] = useState<string | null>(null)

  const installMutation = useMutation({
    mutationFn: installKvm,
    onMutate: () => setActionError(null),
    onSuccess: (data) => {
      setActionError(null)
      void qc.invalidateQueries({ queryKey: ['kvm-status'] })
      toast.success(data?.message || t('kvm.installedSuccess'))
    },
    onError: (err: Error) => {
      const msg = err.message || t('kvm.installFailed')
      setActionError(msg)
      toast.error(msg)
    },
  })

  const startMutation = useMutation({
    mutationFn: startKvm,
    onMutate: () => setActionError(null),
    onSuccess: (data) => {
      setActionError(null)
      void qc.invalidateQueries({ queryKey: ['kvm-status'] })
      toast.success(data?.message || t('kvm.serviceStarted'))
    },
    onError: (err: Error) => {
      const msg = err.message || t('kvm.startFailed')
      setActionError(msg)
      toast.error(msg)
    },
  })

  const kvmActionError = actionError || ''

  const connectRfb = useCallback(async (forceRefreshToken = false) => {
    if (!viewportRef.current) return
    if (standalone && !accessToken) {
      setConnectionError(t('kvm.tokenInvalidTitle'))
      return
    }
    if (forceRefreshToken) {
      desktopTokenRef.current = null
      tokenFailedRef.current = false
    }
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect()
      } catch {}
      rfbRef.current = null
    }

    setConnecting(true)
    setConnectionError(null)

    let streamToken = accessToken ?? ''
    if (!standalone) {
      if (!desktopTokenRef.current) {
        if (tokenFailedRef.current) {
          setConnecting(false)
          setConnectionError(t('kvm.tokenFailed'))
          return
        }
        try {
          const minted = await createKvmToken()
          desktopTokenRef.current = minted.token
        } catch (err) {
          tokenFailedRef.current = true
          setConnecting(false)
          setConnectionError(extractKvmErrorMessage(err, t('kvm.tokenFailed')))
          return
        }
      }
      streamToken = desktopTokenRef.current
    }

    if (!viewportRef.current) return

    try {
      const wsUrl = resolveKvmWsUrl(streamToken)
      const rfb = new RFB(viewportRef.current, wsUrl, {
        wsProtocols: ['binary'],
      })

      rfb.scaleViewport = scaleToFitRef.current
      rfb.resizeSession = false
      rfb.showDotCursor = true
      applyRfbQualityPreset(rfb, qualityModeRef.current)

      rfb.addEventListener('connect', () => {
        setConnected(true)
        setConnecting(false)
        setConnectionError(null)
      })

      rfb.addEventListener('disconnect', (e: Event & { detail?: { clean?: boolean } }) => {
        setConnected(false)
        setConnecting(false)
        if (!standalone) {
          desktopTokenRef.current = null
        }
        if (e.detail && !e.detail.clean) {
          setConnectionError(t('kvm.disconnected'))
        }
      })

      rfb.addEventListener('securityfailure', () => {
        setConnected(false)
        setConnecting(false)
        if (!standalone) {
          desktopTokenRef.current = null
        }
        setConnectionError(t('kvm.tokenInvalidTitle'))
      })

      rfbRef.current = rfb
    } catch (err) {
      setConnecting(false)
      setConnectionError(extractKvmErrorMessage(err, t('kvm.disconnected')))
    }
  }, [standalone, accessToken, t])

  const resolutionMutation = useMutation({
    mutationFn: (nextRes: string) => setKvmResolution(nextRes, standalone ? accessToken : undefined),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['kvm-status'] })
      void qc.invalidateQueries({ queryKey: ['settings', 'site'] })
      toast.success(t('kvm.resolutionChanged', { resolution: res.resolution }))
      if (res.restarted) {
        if (rfbRef.current) {
          try {
            rfbRef.current.disconnect()
          } catch {}
          rfbRef.current = null
        }
        setConnected(false)
        window.setTimeout(() => {
          void connectRfb(true)
        }, 450)
      }
    },
    onError: (err) => {
      toast.error(extractKvmErrorMessage(err, t('kvm.resolutionFailed')))
    },
  })

  useEffect(() => {
    if (status?.enabled && status?.available && !connStateRef.current.connected && !connStateRef.current.connecting) {
      void connectRfb()
    }
    return () => {
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect()
        } catch {}
        rfbRef.current = null
      }
    }
  }, [status?.enabled, status?.available, connectRfb])

  useEffect(() => {
    if (!standalone || !connected || hudPinned || hudHovered || !hudExpanded) return
    const timer = window.setTimeout(() => setHudExpanded(false), 3500)
    return () => window.clearTimeout(timer)
  }, [standalone, connected, hudPinned, hudHovered, hudExpanded])

  const handleQualityModeChange = (nextMode: KvmQualityMode) => {
    setQualityMode(nextMode)
    writeStoredKvmQualityMode(nextMode)
    if (rfbRef.current) {
      applyRfbQualityPreset(rfbRef.current, nextMode)
    }
  }

  const handleToggleScale = () => {
    const next = !scaleToFit
    setScaleToFit(next)
    if (rfbRef.current) {
      rfbRef.current.scaleViewport = next
    }
  }

  const handleSendCad = () => {
    if (rfbRef.current && connected) {
      rfbRef.current.sendCtrlAltDel()
      toast.success(t('kvm.cad'))
    }
  }

  const handleSendSuper = () => {
    if (rfbRef.current && connected) {
      // XK_Super_L = 0xffeb
      rfbRef.current.sendKey(0xffeb, 'MetaLeft', true)
      rfbRef.current.sendKey(0xffeb, 'MetaLeft', false)
      toast.success(t('kvm.superKey'))
    }
  }

  const handleDisconnect = () => {
    if (rfbRef.current) {
      rfbRef.current.disconnect()
      rfbRef.current = null
      setConnected(false)
      setConnecting(false)
    }
  }

  const copyCommand = (cmd: string) => {
    void navigator.clipboard.writeText(cmd)
    setCopied(true)
    toast.success(t('kvm.cmdCopied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const isFullscreen = win?.isFullscreen ?? false
  const port = status?.port ?? 5900
  const display = status?.display ?? ':0'
  const currentResolution = status?.resolution ?? '1280x800'
  const resolutionOptions = Array.from(new Set([...KVM_RESOLUTION_VALUES, currentResolution])).map((r) => ({
    value: r,
    label: r,
  }))
  const qualityOptions = (Object.keys(KVM_QUALITY_PRESETS) as KvmQualityMode[]).map((k) => ({
    value: k,
    label: t(KVM_QUALITY_PRESETS[k].labelKey),
  }))
  const exampleCommand = `x11vnc -display ${display} -rfbport ${port} -shared -forever`

  if (standalone && (!accessToken || isStatusError)) {
    return (
      <div className="kvm-empty">
        <ShieldAlert className="h-10 w-10 text-[var(--panel-danger-text)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.tokenInvalidTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{t('kvm.tokenInvalidDesc')}</p>
        {onBack ? (
          <Button variant="primary" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onBack}>
            {t('kvm.backToPanel')}
          </Button>
        ) : null}
      </div>
    )
  }

  if (isLoading) {
    return <LoadingState>{t('kvm.connecting')}</LoadingState>
  }

  if (status && !status.enabled) {
    return (
      <div className="kvm-empty">
        <MonitorOff className="h-10 w-10 text-[var(--panel-warning-text)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.disabledTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{t('kvm.disabledDesc')}</p>
        {standalone && onBack ? (
          <Button variant="primary" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onBack}>
            {t('kvm.backToPanel')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" icon={<Settings className="h-3.5 w-3.5" />} onClick={() => openWindow('settings')}>
            {t('kvm.openSettings')}
          </Button>
        )}
      </div>
    )
  }

  if (status && status.enabled && !status.installed) {
    return (
      <div className="kvm-empty">
        <MonitorOff className="h-10 w-10 text-[var(--panel-warning-text)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.notInstalledTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{t('kvm.notInstalledDesc')}</p>
        {kvmActionError ? (
          <div className="panel-error-state !min-h-0 max-w-lg w-full !py-2 !px-3 mb-3 text-[11px]" role="alert">
            <span className="font-mono break-all select-text">{kvmActionError}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Download className="h-3.5 w-3.5" />}
            loading={installMutation.isPending}
            disabled={installMutation.isPending}
            onClick={() => installMutation.mutate()}
          >
            {installMutation.isPending ? t('kvm.installing') : t('kvm.installBtn')}
          </Button>
          {standalone && onBack ? (
            <Button variant="outline" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onBack}>
              {t('kvm.backToPanel')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" icon={<Settings className="h-3.5 w-3.5" />} onClick={() => openWindow('settings')}>
              {t('kvm.openSettings')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (status && !status.available && !connected) {
    return (
      <div className="kvm-empty">
        <Monitor className="h-10 w-10 text-[var(--text-secondary)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.notRunningTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-2">{t('kvm.notRunningDesc', { port })}</p>

        <div className="kvm-code-box">
          <span className="truncate select-all font-mono">{exampleCommand}</span>
          <IconButton
            label={t('kvm.copyCmd')}
            onClick={() => copyCommand(exampleCommand)}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--panel-success-text)]" /> : <Copy className="h-3.5 w-3.5" />}
          </IconButton>
        </div>

        {kvmActionError ? (
          <div className="panel-error-state !min-h-0 max-w-lg w-full !py-2 !px-3 mt-2 text-[11px]" role="alert">
            <span className="font-mono break-all select-text">{kvmActionError}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Play className="h-3.5 w-3.5" />}
            loading={startMutation.isPending}
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending ? t('kvm.startingService') : t('kvm.startService')}
          </Button>
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refetch()}>
            {t('kvm.retry')}
          </Button>
          {standalone && onBack ? (
            <Button variant="outline" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onBack}>
              {t('kvm.backToPanel')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" icon={<Terminal className="h-3.5 w-3.5" />} onClick={() => openWindow('host-terminal')}>
              {t('kvm.openTerminal')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (standalone) {
    const connState: 'connecting' | 'connected' | 'disconnected' = connected
      ? 'connected'
      : connecting
        ? 'connecting'
        : 'disconnected'
    return (
      <div className="kvm-container kvm-container--standalone">
        <KvmFloatingHud
          connState={connState}
          expanded={hudExpanded}
          pinned={hudPinned}
          scaleToFit={scaleToFit}
          isFullscreen={isBrowserFullscreen}
          qualityMode={qualityMode}
          resolution={currentResolution}
          resolutionOptions={resolutionOptions}
          resolvingResolution={resolutionMutation.isPending}
          onExpand={() => setHudExpanded(true)}
          onCollapse={() => setHudExpanded(false)}
          onTogglePin={() => setHudPinned((v) => !v)}
          onHoverChange={setHudHovered}
          onQualityModeChange={handleQualityModeChange}
          onResolutionChange={(nextRes) => resolutionMutation.mutate(nextRes)}
          onToggleScale={handleToggleScale}
          onSendCad={handleSendCad}
          onSendSuper={handleSendSuper}
          onReconnect={() => void connectRfb(true)}
          onToggleFullscreen={handleToggleBrowserFullscreen}
          onBack={onBack}
        />
        <div
          ref={viewportRef}
          className="kvm-viewport kvm-viewport--fullscreen"
          tabIndex={0}
          aria-label={t('kvm.title')}
        />
      </div>
    )
  }

  return (
    <div className="kvm-container">
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
            onChange={(val) => handleQualityModeChange(val as KvmQualityMode)}
            options={qualityOptions}
            placeholder={t('kvm.modeLabel')}
            buttonClassName="kvm-hud__select"
            dropdownWidth={168}
          />
          <Select
            size="sm"
            value={currentResolution}
            onChange={(nextRes) => resolutionMutation.mutate(nextRes)}
            options={resolutionOptions}
            disabled={resolutionMutation.isPending}
            placeholder={t('kvm.resolutionLabel')}
            buttonClassName="kvm-hud__select kvm-hud__select--mono"
            dropdownWidth={148}
          />
          <Button
            size="sm"
            variant="outline"
            className="kvm-key-btn"
            disabled={!connected}
            onClick={handleSendCad}
            title={t('kvm.cad')}
            aria-label={t('kvm.cad')}
          >
            {t('kvm.cadShort')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="kvm-key-btn"
            disabled={!connected}
            onClick={handleSendSuper}
            title={t('kvm.superKey')}
            aria-label={t('kvm.superKey')}
          >
            {t('kvm.superShort')}
          </Button>
          <div className="kvm-toolbar__divider" />
          <IconButton
            tone={scaleToFit ? 'primary' : 'default'}
            className={scaleToFit ? 'kvm-icon-btn--active' : ''}
            label={t('kvm.scale')}
            aria-pressed={scaleToFit}
            onClick={handleToggleScale}
          >
            <Scale className="h-3.5 w-3.5" />
          </IconButton>
          {connected ? (
            <IconButton tone="danger" label={t('kvm.disconnect')} onClick={handleDisconnect}>
              <Power className="h-3.5 w-3.5" />
            </IconButton>
          ) : (
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw className={`h-3 w-3 ${connecting ? 'animate-spin' : ''}`} />}
              disabled={connecting}
              onClick={() => void connectRfb(true)}
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
          {win ? (
            <IconButton
              label={t('kvm.fullscreen')}
              aria-pressed={isFullscreen}
              onClick={() => toggleFullscreen(win.id)}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </IconButton>
          ) : null}
        </div>
      </div>

      <div ref={viewportRef} className="kvm-viewport" tabIndex={0} aria-label={t('kvm.title')} />
    </div>
  )
}
