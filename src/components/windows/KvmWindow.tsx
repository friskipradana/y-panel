import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import RFB from '@novnc/novnc'
import { toast } from 'sonner'
import { createKvmToken, getKvmStatus, installKvm, resolveKvmWsUrl, setKvmResolution, startKvm, type KvmQualityMode } from '@/api/kvm'
import { LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'
import { KvmFloatingHud } from './KvmFloatingHud'
import { KvmEmptyState } from './KvmEmptyStates'
import { KvmDesktopToolbar } from './KvmDesktopToolbar'
import {
  applyRfbQualityPreset,
  extractKvmErrorMessage,
  KVM_QUALITY_PRESETS,
  KVM_RESOLUTION_VALUES,
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
    const handler = () => setIsBrowserFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleToggleBrowserFullscreen = () => {
    const op = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    void op.catch(() => {})
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

  const handleActionResult = (msg: string) => {
    setActionError(null)
    void qc.invalidateQueries({ queryKey: ['kvm-status'] })
    toast.success(msg)
  }
  const handleActionErr = (err: Error, fallback: string) => {
    const msg = err.message || fallback
    setActionError(msg)
    toast.error(msg)
  }
  const installMutation = useMutation({
    mutationFn: installKvm,
    onMutate: () => setActionError(null),
    onSuccess: (data) => handleActionResult(data?.message || t('kvm.installedSuccess')),
    onError: (err: Error) => handleActionErr(err, t('kvm.installFailed')),
  })
  const startMutation = useMutation({
    mutationFn: startKvm,
    onMutate: () => setActionError(null),
    onSuccess: (data) => handleActionResult(data?.message || t('kvm.serviceStarted')),
    onError: (err: Error) => handleActionErr(err, t('kvm.startFailed')),
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

  const emptyShared = {
    standalone,
    port,
    exampleCommand,
    copied,
    kvmActionError,
    installing: installMutation.isPending,
    starting: startMutation.isPending,
    t,
    onBack,
    onOpenWindow: openWindow,
    onInstall: () => installMutation.mutate(),
    onStart: () => startMutation.mutate(),
    onRetry: () => void refetch(),
    onCopyCommand: copyCommand,
  }

  if (standalone && (!accessToken || isStatusError)) return <KvmEmptyState kind="token-invalid" {...emptyShared} />
  if (isLoading) return <LoadingState>{t('kvm.connecting')}</LoadingState>
  if (status && !status.enabled) return <KvmEmptyState kind="disabled" {...emptyShared} />
  if (status && status.enabled && !status.installed) return <KvmEmptyState kind="not-installed" {...emptyShared} />
  if (status && !status.available && !connected) return <KvmEmptyState kind="not-running" {...emptyShared} />

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
      <KvmDesktopToolbar
        connected={connected}
        connecting={connecting}
        display={display}
        connectionError={connectionError}
        qualityMode={qualityMode}
        qualityOptions={qualityOptions}
        currentResolution={currentResolution}
        resolutionOptions={resolutionOptions}
        resolvingResolution={resolutionMutation.isPending}
        scaleToFit={scaleToFit}
        hasWindow={Boolean(win)}
        isFullscreen={isFullscreen}
        t={t}
        onQualityModeChange={handleQualityModeChange}
        onResolutionChange={(nextRes) => resolutionMutation.mutate(nextRes)}
        onSendCad={handleSendCad}
        onSendSuper={handleSendSuper}
        onToggleScale={handleToggleScale}
        onDisconnect={handleDisconnect}
        onReconnect={() => void connectRfb(true)}
        onToggleFullscreen={() => {
          if (win) toggleFullscreen(win.id)
        }}
      />
      <div ref={viewportRef} className="kvm-viewport" tabIndex={0} aria-label={t('kvm.title')} />
    </div>
  )
}
