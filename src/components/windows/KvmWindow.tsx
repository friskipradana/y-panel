import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import RFB from '@novnc/novnc'
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorOff,
  Power,
  RefreshCw,
  Scale,
  Settings,
  Terminal,
} from 'lucide-react'
import { toast } from 'sonner'
import { getKvmStatus, resolveKvmWsUrl } from '@/api/kvm'
import { AppIcon } from '@/components/common/AppIcon'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'

export interface KvmWindowProps {
  win?: WindowState
  authenticated?: boolean
  standalone?: boolean
  onBack?: () => void
}

export function KvmWindow({ win, authenticated, standalone, onBack }: KvmWindowProps) {
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

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['kvm-status'],
    queryFn: getKvmStatus,
    enabled: authenticated !== false,
    retry: 1,
  })

  const connectRfb = useCallback(() => {
    if (!viewportRef.current) return
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect()
      } catch {}
      rfbRef.current = null
    }

    setConnecting(true)
    setConnectionError(null)

    try {
      const wsUrl = resolveKvmWsUrl()
      const rfb = new RFB(viewportRef.current, wsUrl, {
        wsProtocols: ['binary'],
      })

      rfb.scaleViewport = scaleToFit
      rfb.resizeSession = true
      rfb.showDotCursor = true

      rfb.addEventListener('connect', () => {
        setConnected(true)
        setConnecting(false)
        setConnectionError(null)
      })

      rfb.addEventListener('disconnect', (e: Event & { detail?: { clean?: boolean } }) => {
        setConnected(false)
        setConnecting(false)
        if (e.detail && !e.detail.clean) {
          setConnectionError(t('kvm.disconnected'))
        }
      })

      rfb.addEventListener('securityfailure', () => {
        setConnected(false)
        setConnecting(false)
        setConnectionError('Autentikasi VNC gagal')
      })

      rfbRef.current = rfb
    } catch (err) {
      setConnecting(false)
      setConnectionError(err instanceof Error ? err.message : 'Koneksi gagal')
    }
  }, [scaleToFit, t])

  useEffect(() => {
    if (status?.enabled && status?.available && !connected && !connecting) {
      connectRfb()
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
  const exampleCommand = `x11vnc -display ${display} -rfbport ${port} -shared -forever`

  if (isLoading) {
    return <LoadingState>{t('kvm.connecting')}</LoadingState>
  }

  if (status && !status.enabled) {
    return (
      <div className="kvm-empty">
        <MonitorOff className="h-10 w-10 text-[var(--panel-warning-text)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.disabledTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{t('kvm.disabledDesc')}</p>
        <Button variant="primary" size="sm" icon={<Settings className="h-3.5 w-3.5" />} onClick={() => openWindow('settings')}>
          {t('kvm.openSettings')}
        </Button>
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

        <div className="flex items-center gap-2 mt-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refetch()}>
            {t('kvm.retry')}
          </Button>
          <Button variant="primary" size="sm" icon={<Terminal className="h-3.5 w-3.5" />} onClick={() => openWindow('host-terminal')}>
            {t('kvm.openTerminal')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="kvm-container">
      {/* ── Toolbar ── */}
      <div className={standalone ? 'kvm-toolbar kvm-toolbar--standalone' : 'kvm-toolbar'}>
        <div className="kvm-toolbar__group">
          {standalone && onBack ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={onBack}
            >
              {t('kvm.backToPanel')}
            </Button>
          ) : null}

          {standalone ? (
            <div className="flex items-center gap-2 mr-1">
              <AppIcon kind="kvm" className="h-4 w-4" />
              <span className="text-xs font-semibold text-[var(--win-text)] hidden sm:inline">
                {t('kvm.title')}
              </span>
            </div>
          ) : null}

          <div className="kvm-status-badge">
            <span
              className={`kvm-status-dot ${
                connected
                  ? 'kvm-status-dot--online'
                  : connecting
                    ? 'kvm-status-dot--busy kvm-status-dot--pulse'
                    : 'kvm-status-dot'
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

        <div className="kvm-toolbar__group">
          <Button
            size="sm"
            variant="ghost"
            disabled={!connected}
            onClick={handleSendCad}
            title={t('kvm.cad')}
            aria-label={t('kvm.cad')}
          >
            Ctrl+Alt+Del
          </Button>

          <Button
            size="sm"
            variant="ghost"
            disabled={!connected}
            onClick={handleSendSuper}
            title={t('kvm.superKey')}
            aria-label={t('kvm.superKey')}
          >
            Win
          </Button>

          <Button
            size="sm"
            variant={scaleToFit ? 'outline' : 'ghost'}
            icon={<Scale className="h-3.5 w-3.5" />}
            onClick={handleToggleScale}
            title={t('kvm.scale')}
            aria-label={t('kvm.scale')}
          />

          {connected ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Power className="h-3.5 w-3.5 text-[var(--panel-danger-text)]" />}
              onClick={handleDisconnect}
              title={t('kvm.disconnect')}
              aria-label={t('kvm.disconnect')}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw className={`h-3 w-3 ${connecting ? 'animate-spin' : ''}`} />}
              disabled={connecting}
              onClick={connectRfb}
              title={t('kvm.reconnect')}
              aria-label={t('kvm.reconnect')}
            >
              {t('kvm.reconnect')}
            </Button>
          )}

          {!standalone ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => window.open('/kvm', '_blank')}
              title={t('kvm.openInNewTab')}
              aria-label={t('kvm.openInNewTab')}
            />
          ) : null}

          {standalone ? (
            <Button
              size="sm"
              variant="ghost"
              icon={isBrowserFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              onClick={handleToggleBrowserFullscreen}
              title={t('kvm.fullscreen')}
              aria-label={t('kvm.fullscreen')}
            />
          ) : win ? (
            <Button
              size="sm"
              variant="ghost"
              icon={isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              onClick={() => toggleFullscreen(win.id)}
              title={t('kvm.fullscreen')}
              aria-label={t('kvm.fullscreen')}
            />
          ) : null}
        </div>
      </div>

      {/* ── Viewport ── */}
      <div ref={viewportRef} className="kvm-viewport" tabIndex={0} aria-label={t('kvm.title')} />
    </div>
  )
}
