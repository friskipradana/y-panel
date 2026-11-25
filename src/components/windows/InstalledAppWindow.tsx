import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { installedAppOpenUrl } from '@/api/appCatalog'
import { InstalledAppBadge } from '@/components/common/AppIcon'
import type { ActionMenuItem } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import { InstalledAppToolbar } from '@/components/windows/installed-app/InstalledAppToolbar'
import { useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useI18n } from '@/lib/i18n'
import { useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'

interface InstalledAppWindowProps {
  win: WindowState
}

const APP_URL_STORAGE_PREFIX = 'reneo:app-last-url:'
const APP_AUTOHIDE_PREFIX = 'reneo:app-autohide:'
const IFRAME_ALLOW_POLICY =
  'autoplay; fullscreen; picture-in-picture; clipboard-read; clipboard-write; microphone; camera; display-capture; encrypted-media; speaker-selection; gamepad'

function getSavedAppUrl(appId: number, baseOpenUrl: string): string {
  try {
    const saved = window.localStorage.getItem(`${APP_URL_STORAGE_PREFIX}${appId}`)
    if (!saved) return baseOpenUrl
    const base = new URL(baseOpenUrl, window.location.origin)
    const target = new URL(saved, window.location.origin)
    if (target.origin !== base.origin) return baseOpenUrl
    if (!target.pathname.startsWith(base.pathname.replace(/\/$/, ''))) return baseOpenUrl
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return baseOpenUrl
  }
}

function saveAppUrl(appId: number, baseOpenUrl: string, currentHref: string) {
  try {
    const base = new URL(baseOpenUrl, window.location.origin)
    const target = new URL(currentHref, window.location.origin)
    if (target.origin !== base.origin) return
    if (!target.pathname.startsWith(base.pathname.replace(/\/$/, ''))) return
    window.localStorage.setItem(`${APP_URL_STORAGE_PREFIX}${appId}`, `${target.pathname}${target.search}${target.hash}`)
  } catch {
    // Cross-origin iframes cannot be read from the parent frame
  }
}

function readAutoHide(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(`${APP_AUTOHIDE_PREFIX}${storageKey}`) === '1'
  } catch {
    return false
  }
}

function detectIframeContentSize(iframe: HTMLIFrameElement | null): { width: number; height: number; ratio: number } | null {
  try {
    const doc = iframe?.contentDocument
    if (!doc) return null

    // Prefer remote desktop / video / canvas element dimensions (Selkies, KasmVNC, Jellyfin, YouTube)
    const videos = Array.from(doc.querySelectorAll('video'))
    for (const v of videos) {
      if (v.videoWidth >= 320 && v.videoHeight >= 180) {
        return { width: v.videoWidth, height: v.videoHeight, ratio: v.videoWidth / v.videoHeight }
      }
    }
    const canvases = Array.from(doc.querySelectorAll('canvas'))
    let bestCanvas: HTMLCanvasElement | null = null
    for (const c of canvases) {
      const area = c.width * c.height
      if (area >= 320 * 180 && (!bestCanvas || area > bestCanvas.width * bestCanvas.height)) {
        bestCanvas = c
      }
    }
    if (bestCanvas) {
      return { width: bestCanvas.width, height: bestCanvas.height, ratio: bestCanvas.width / bestCanvas.height }
    }

    const root = doc.documentElement
    const body = doc.body
    const sw = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0)
    const sh = Math.max(root?.scrollHeight || 0, body?.scrollHeight || 0)
    if (sw >= 360 && sh >= 240) {
      return { width: sw, height: sh, ratio: sw / sh }
    }
  } catch {
    // Cross-origin frame
  }
  return null
}

function nudgeIframeResize(iframe: HTMLIFrameElement | null) {
  try {
    iframe?.contentWindow?.dispatchEvent(new Event('resize'))
  } catch {
    // Cross-origin frame
  }
}

export function InstalledAppWindow({ win }: InstalledAppWindowProps) {
  const { t } = useI18n()
  const isMobile = useIsMobileLayout()
  const togglePipWindow = useWindowStore((s) => s.togglePipWindow)
  const fitWindowToContent = useWindowStore((s) => s.fitWindowToContent)

  const isSharedCrm = win.params?.sharedCrm === true
  const sharedCrmOpenUrl = typeof win.params?.openUrl === 'string' && win.params.openUrl.trim() ? win.params.openUrl.trim() : '/app/reneo-crm/'
  const sharedCrmTitle = typeof win.params?.appName === 'string' && win.params.appName.trim() ? win.params.appName.trim() : 'Reneo CRM'
  const appId = Number(win.params?.appId || 0)
  const storageKey = isSharedCrm ? `shared-${sharedCrmOpenUrl}` : String(appId || win.id)

  const { data, isLoading, isError, error, refetch, isFetching } = useAppCatalog(!isSharedCrm)
  const { actionMutation, updateMutation } = useAppCatalogMutations()

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadedNonce, setLoadedNonce] = useState(-1)
  const [editOpen, setEditOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'restart' | null>(null)
  const [homeOverride, setHomeOverride] = useState(false)
  const [autoHide, setAutoHide] = useState(() => readAutoHide(storageKey))

  const app = data?.installed.find((item) => item.id === appId)
  const openUrl = isSharedCrm ? sharedCrmOpenUrl : app ? installedAppOpenUrl(app) : ''

  const toggleAutoHide = useCallback(() => {
    setAutoHide((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(`${APP_AUTOHIDE_PREFIX}${storageKey}`, next ? '1' : '0')
      } catch {
        // Ignore storage errors
      }
      window.setTimeout(() => nudgeIframeResize(iframeRef.current), 180)
      return next
    })
  }, [storageKey])

  const handleFitToContent = useCallback(() => {
    const chromeH = (win.isPip ? 0 : 38) + (!autoHide && !win.isPip && !win.isFullscreen && !isMobile ? 40 : 0)
    const maxW = Math.max(360, window.innerWidth - 28)
    const maxH = Math.max(240, window.innerHeight - 44 - 28)
    const detected = detectIframeContentSize(iframeRef.current)
    const ratio = detected ? Math.min(2.35, Math.max(0.7, detected.ratio)) : 16 / 9

    let targetContentW = detected ? detected.width : Math.round((win.height - chromeH) * ratio)
    let targetContentH = detected ? detected.height : Math.round(targetContentW / ratio)

    // Scale down proportionally if intrinsic stream/page exceeds desktop viewport so aspect ratio stays exact
    const availH = Math.max(180, maxH - chromeH)
    if (targetContentW > maxW || targetContentH > availH) {
      const scale = Math.min(maxW / targetContentW, availH / targetContentH)
      targetContentW = Math.round(targetContentW * scale)
      targetContentH = Math.round(targetContentH * scale)
    }

    fitWindowToContent(win.id, targetContentW, targetContentH + chromeH)
    window.setTimeout(() => nudgeIframeResize(iframeRef.current), 120)
    toast.success(t('appCatalog.fitToContentDone'))
  }, [win.id, win.height, win.isPip, win.isFullscreen, autoHide, isMobile, fitWindowToContent, t])

  const handleTogglePip = useCallback(() => {
    const detected = detectIframeContentSize(iframeRef.current)
    togglePipWindow(win.id, detected?.ratio)
    window.setTimeout(() => nudgeIframeResize(iframeRef.current), 180)
  }, [win.id, togglePipWindow])

  const syncCurrentIframeUrl = useCallback(() => {
    if (isSharedCrm || !app || !openUrl) return
    try {
      const href = iframeRef.current?.contentWindow?.location?.href
      if (href && href !== 'about:blank') saveAppUrl(app.id, openUrl, href)
    } catch {
      // Cross-origin iframes block location access
    }
  }, [isSharedCrm, app, openUrl])

  useEffect(() => () => syncCurrentIframeUrl(), [syncCurrentIframeUrl])

  // Notify embedded VNC/Selkies/web apps immediately when the window viewport changes size
  useEffect(() => {
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let timer: number | null = null
    const ro = new ResizeObserver(() => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        nudgeIframeResize(iframeRef.current)
      }, 90)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [reloadNonce])

  if (isSharedCrm) {
    const sharedFrameLoading = loadedNonce !== reloadNonce
    return (
      <div className="installed-app-shell">
        <InstalledAppToolbar
          statusTone="success"
          statusLabel={t('appCatalog.statusRunning')}
          endpointLabel={sharedCrmOpenUrl}
          isMobile={isMobile}
          isPip={Boolean(win.isPip)}
          isFullscreen={win.isFullscreen}
          autoHide={autoHide}
          onToggleAutoHide={toggleAutoHide}
          onFitToContent={handleFitToContent}
          onTogglePip={handleTogglePip}
          onRefresh={() => setReloadNonce((n) => n + 1)}
          onOpenNewTab={() => window.open(sharedCrmOpenUrl, '_blank', 'noopener,noreferrer')}
        />
        <div ref={viewportRef} className="installed-app-viewport">
          {sharedFrameLoading ? (
            <div className="installed-app-loading" aria-live="polite">
              <LoadingState>{t('appCatalog.loadingAppView')}</LoadingState>
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            key={`shared-crm-${reloadNonce}`}
            src={sharedCrmOpenUrl}
            title={sharedCrmTitle}
            onLoad={() => setLoadedNonce(reloadNonce)}
            className="installed-app-frame"
            allow={IFRAME_ALLOW_POLICY}
            allowFullScreen
          />
        </div>
      </div>
    )
  }

  if (isLoading && !app) return <LoadingState>{t('appCatalog.loading')}</LoadingState>
  if (isError && !app) {
    return (
      <ErrorState
        title={t('appCatalog.loadFailed')}
        hint={error instanceof Error ? error.message : undefined}
        action={<Button size="sm" variant="outline" onClick={() => refetch()}>{t('common.refresh')}</Button>}
      />
    )
  }
  if (!app) {
    return (
      <EmptyState>
        <span className="block font-medium text-[var(--win-text)]">{t('appCatalog.appNotFoundTitle')}</span>
        <span className="block text-[var(--text-secondary)]">{t('appCatalog.appNotFoundDesc')}</span>
      </EmptyState>
    )
  }

  const isContainer = app.kind === 'docker' || app.kind === 'existing-container'
  const isRunning = !isContainer || app.containerState === 'running' || app.containerState === 'restarting'
  const isMissing = isContainer && app.containerState === 'missing'
  const iframeSrc = homeOverride ? openUrl : getSavedAppUrl(app.id, openUrl)
  const endpointLabel = app.kind === 'custom-url' ? app.targetUrl : `127.0.0.1:${app.hostPort}${app.openPath}`
  const frameLoading = isRunning && !isMissing && loadedNonce !== reloadNonce

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setPendingAction(action)
    try {
      await actionMutation.mutateAsync({ id: app.id, action })
      if (action === 'start' || action === 'restart') setTimeout(() => setReloadNonce((n) => n + 1), 900)
      toast.success(t('appCatalog.containerActionSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setPendingAction(null)
    }
  }

  const handleToggleProxy = async () => {
    try {
      await updateMutation.mutateAsync({ id: app.id, payload: { useProxy: !app.useProxy } })
      setReloadNonce((n) => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    }
  }

  const statusTone = isMissing ? 'danger' : !isRunning ? 'warning' : isContainer ? 'success' : app.useProxy ? 'info' : 'neutral'
  const statusLabel = isMissing
    ? t('appCatalog.statusMissing')
    : !isRunning
      ? t('appCatalog.statusStopped')
      : isContainer
        ? t('appCatalog.statusRunning')
        : app.useProxy
          ? t('appCatalog.statusProxy')
          : t('appCatalog.statusDirect')

  const overflowActions: ActionMenuItem[] = [
    ...(isContainer
      ? isRunning
        ? [
            {
              key: 'restart',
              label: t('appCatalog.restartContainer'),
              loading: actionMutation.isPending && pendingAction === 'restart',
              disabled: actionMutation.isPending,
              onSelect: () => void handleAction('restart'),
            },
            {
              key: 'stop',
              label: t('appCatalog.stopContainer'),
              tone: 'warning' as const,
              loading: actionMutation.isPending && pendingAction === 'stop',
              disabled: actionMutation.isPending,
              onSelect: () => void handleAction('stop'),
            },
          ]
        : [
            {
              key: 'start',
              label: t('appCatalog.startContainer'),
              tone: 'primary' as const,
              loading: actionMutation.isPending && pendingAction === 'start',
              disabled: actionMutation.isPending || isMissing,
              onSelect: () => void handleAction('start'),
            },
          ]
      : [
          {
            key: 'proxy',
            label: app.useProxy ? t('appCatalog.switchDirect') : t('appCatalog.switchProxy'),
            loading: updateMutation.isPending,
            onSelect: () => void handleToggleProxy(),
          },
        ]),
    { key: 'fit', label: t('appCatalog.fitToContent'), dividerBefore: true, onSelect: handleFitToContent },
    { key: 'pip', label: win.isPip ? t('window.pipExit') : t('window.pipEnter'), onSelect: handleTogglePip },
    { key: 'autohide', label: autoHide ? t('appCatalog.showToolbar') : t('appCatalog.autoHideToolbar'), onSelect: toggleAutoHide },
    {
      key: 'home',
      label: t('appCatalog.resetHome'),
      dividerBefore: true,
      disabled: !isRunning,
      onSelect: () => {
        try {
          window.localStorage.removeItem(`${APP_URL_STORAGE_PREFIX}${app.id}`)
        } catch {
          // Ignore
        }
        setHomeOverride(true)
        setReloadNonce((n) => n + 1)
      },
    },
    { key: 'edit', label: t('common.edit'), onSelect: () => setEditOpen(true) },
  ]

  return (
    <div className="installed-app-shell">
      <InstalledAppToolbar
        statusTone={statusTone}
        statusLabel={statusLabel}
        endpointLabel={endpointLabel}
        isMobile={isMobile}
        isPip={Boolean(win.isPip)}
        isFullscreen={win.isFullscreen}
        autoHide={autoHide}
        isFetching={isFetching}
        menuLoading={actionMutation.isPending || updateMutation.isPending}
        overflowActions={overflowActions}
        onToggleAutoHide={toggleAutoHide}
        onFitToContent={handleFitToContent}
        onTogglePip={handleTogglePip}
        onRefresh={() => {
          refetch()
          setReloadNonce((n) => n + 1)
        }}
        onOpenNewTab={() => window.open(openUrl, '_blank', 'noopener,noreferrer')}
      />

      {!isContainer && !app.useProxy ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--win-border)] bg-[var(--win-bg-soft)] px-3 py-1.5 text-[0.75rem] text-[var(--text-secondary)]">
          <span>{t('appCatalog.directModeHint')}</span>
          <Button size="sm" variant="primary" onClick={handleToggleProxy} loading={updateMutation.isPending}>
            {t('appCatalog.switchProxy')}
          </Button>
        </div>
      ) : null}

      <div ref={viewportRef} className="installed-app-viewport">
        {isMissing ? (
          <ErrorState
            title={t('appCatalog.containerMissingError')}
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" loading={actionMutation.isPending} onClick={() => handleAction('start')}>
                  {t('appCatalog.startContainer')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  {t('common.refresh')}
                </Button>
              </div>
            }
          />
        ) : !isRunning ? (
          <EmptyState icon={<InstalledAppBadge iconKey={app.iconKey} iconColor={app.iconColor} size="lg" />}>
            <span className="block font-medium text-[var(--win-text)]">{t('appCatalog.containerStoppedTitle')}</span>
            <span className="mb-2.5 block text-[var(--text-secondary)]">{t('appCatalog.containerStoppedDesc')}</span>
            <Button variant="primary" loading={actionMutation.isPending} onClick={() => handleAction('start')}>
              {t('appCatalog.startContainer')}
            </Button>
          </EmptyState>
        ) : (
          <>
            {frameLoading ? (
              <div className="installed-app-loading" aria-live="polite">
                <LoadingState>{t('appCatalog.loadingAppView')}</LoadingState>
              </div>
            ) : null}
            <iframe
              ref={iframeRef}
              key={`${app.id}-${reloadNonce}`}
              src={iframeSrc}
              title={app.name}
              onLoad={() => {
                setLoadedNonce(reloadNonce)
                setHomeOverride(false)
                syncCurrentIframeUrl()
                window.setTimeout(() => nudgeIframeResize(iframeRef.current), 260)
                try {
                  iframeRef.current?.contentWindow?.addEventListener('hashchange', syncCurrentIframeUrl)
                  iframeRef.current?.contentWindow?.addEventListener('popstate', syncCurrentIframeUrl)
                } catch {
                  // Ignore cross-origin listener restrictions
                }
              }}
              className="installed-app-frame"
              allow={IFRAME_ALLOW_POLICY}
              allowFullScreen
            />
          </>
        )}
      </div>

      <InstallAppModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editingApp={app}
        onSuccessApp={() => {
          refetch()
          setReloadNonce((n) => n + 1)
        }}
      />
    </div>
  )
}
