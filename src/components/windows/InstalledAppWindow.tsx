import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { installedAppOpenUrl } from '@/api/appCatalog'
import { InstalledAppBadge } from '@/components/common/AppIcon'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import { useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'

interface InstalledAppWindowProps {
  win: WindowState
}

const APP_URL_STORAGE_PREFIX = 'reneo:app-last-url:'

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
    window.localStorage.setItem(
      `${APP_URL_STORAGE_PREFIX}${appId}`,
      `${target.pathname}${target.search}${target.hash}`,
    )
  } catch {
    // Cross-origin iframes cannot be read from the parent frame
  }
}

function clearSavedAppUrl(appId: number) {
  try {
    window.localStorage.removeItem(`${APP_URL_STORAGE_PREFIX}${appId}`)
  } catch {
    // Ignore storage errors
  }
}

export function InstalledAppWindow({ win }: InstalledAppWindowProps) {
  const { t } = useI18n()
  const isMobile = useIsMobileLayout()
  const isSharedCrm = win.params?.sharedCrm === true
  const sharedCrmOpenUrl = typeof win.params?.openUrl === 'string' && win.params.openUrl.trim()
    ? win.params.openUrl.trim()
    : '/app/reneo-crm/'
  const sharedCrmTitle = typeof win.params?.appName === 'string' && win.params.appName.trim()
    ? win.params.appName.trim()
    : 'Reneo CRM'
  const appId = Number(win.params?.appId || 0)
  const { data, isLoading, isError, error, refetch, isFetching } = useAppCatalog(!isSharedCrm)
  const { actionMutation, updateMutation } = useAppCatalogMutations()

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadedNonce, setLoadedNonce] = useState(-1)
  const [editOpen, setEditOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | 'restart' | null>(null)
  const [homeOverride, setHomeOverride] = useState(false)

  const app = data?.installed.find((item) => item.id === appId)
  const openUrl = isSharedCrm ? sharedCrmOpenUrl : app ? installedAppOpenUrl(app) : ''

  const syncCurrentIframeUrl = useCallback(() => {
    if (isSharedCrm || !app || !openUrl) return
    try {
      const href = iframeRef.current?.contentWindow?.location?.href
      if (href && href !== 'about:blank') {
        saveAppUrl(app.id, openUrl, href)
      }
    } catch {
      // Cross-origin iframes block location access
    }
  }, [isSharedCrm, app, openUrl])

  useEffect(() => {
    return () => {
      syncCurrentIframeUrl()
    }
  }, [syncCurrentIframeUrl])

  if (isSharedCrm) {
    const sharedFrameLoading = loadedNonce !== reloadNonce
    return (
      <div className="installed-app-shell">
        <div className={`installed-app-toolbar ${isMobile ? 'installed-app-toolbar--mobile' : ''}`}>
          <div className="installed-app-toolbar__meta">
            <Badge tone="success" size="sm" dot>
              {t('appCatalog.statusRunning')}
            </Badge>
            <span className="installed-app-endpoint panel-mono" title={sharedCrmOpenUrl}>
              {sharedCrmOpenUrl}
            </span>
          </div>

          <div className="installed-app-toolbar__actions">
            <IconButton
              label={t('common.refresh')}
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>

            <IconButton
              label={t('appCatalog.openNewTab')}
              onClick={() => window.open(sharedCrmOpenUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>

        <div className="installed-app-viewport">
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
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </div>
      </div>
    )
  }

  if (isLoading && !app) {
    return <LoadingState>{t('appCatalog.loading')}</LoadingState>
  }

  if (isError && !app) {
    return (
      <ErrorState
        title={t('appCatalog.loadFailed')}
        hint={error instanceof Error ? error.message : undefined}
        action={
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('common.refresh')}
          </Button>
        }
      />
    )
  }

  if (!app) {
    return (
      <EmptyState>
        <span className="block font-medium text-[var(--win-text)]">
          {t('appCatalog.appNotFoundTitle')}
        </span>
        <span className="block text-[var(--text-secondary)]">
          {t('appCatalog.appNotFoundDesc')}
        </span>
      </EmptyState>
    )
  }

  const isContainer = app.kind === 'docker' || app.kind === 'existing-container'
  const isRunning = !isContainer || app.containerState === 'running' || app.containerState === 'restarting'
  const isMissing = isContainer && app.containerState === 'missing'
  const iframeSrc = homeOverride ? openUrl : getSavedAppUrl(app.id, openUrl)
  const endpointLabel =
    app.kind === 'custom-url'
      ? app.targetUrl
      : `127.0.0.1:${app.hostPort}${app.openPath}`
  const frameLoading = isRunning && !isMissing && loadedNonce !== reloadNonce

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setPendingAction(action)
    try {
      await actionMutation.mutateAsync({ id: app.id, action })
      if (action === 'start' || action === 'restart') {
        setTimeout(() => setReloadNonce((n) => n + 1), 900)
      }
      toast.success(t('appCatalog.containerActionSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setPendingAction(null)
    }
  }

  const handleToggleProxy = async () => {
    try {
      await updateMutation.mutateAsync({
        id: app.id,
        payload: { useProxy: !app.useProxy },
      })
      setReloadNonce((n) => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    }
  }

  const statusTone = isMissing
    ? 'danger'
    : !isRunning
      ? 'warning'
      : isContainer
        ? 'success'
        : app.useProxy
          ? 'info'
          : 'neutral'

  const statusLabel = isMissing
    ? t('appCatalog.statusMissing')
    : !isRunning
      ? t('appCatalog.statusStopped')
      : isContainer
        ? t('appCatalog.statusRunning')
        : app.useProxy
          ? t('appCatalog.statusProxy')
          : t('appCatalog.statusDirect')

  const overflowActions: ActionMenuItem[] = (() => {
    const items: ActionMenuItem[] = []
    if (isContainer) {
      if (isRunning) {
        items.push(
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
            tone: 'warning',
            loading: actionMutation.isPending && pendingAction === 'stop',
            disabled: actionMutation.isPending,
            onSelect: () => void handleAction('stop'),
          },
        )
      } else {
        items.push({
          key: 'start',
          label: t('appCatalog.startContainer'),
          tone: 'primary',
          loading: actionMutation.isPending && pendingAction === 'start',
          disabled: actionMutation.isPending || isMissing,
          onSelect: () => void handleAction('start'),
        })
      }
    } else {
      items.push({
        key: 'proxy',
        label: app.useProxy ? t('appCatalog.switchDirect') : t('appCatalog.switchProxy'),
        loading: updateMutation.isPending,
        onSelect: () => void handleToggleProxy(),
      })
    }
    items.push(
      {
        key: 'home',
        label: t('appCatalog.resetHome'),
        dividerBefore: true,
        disabled: !isRunning,
        onSelect: () => {
          clearSavedAppUrl(app.id)
          setHomeOverride(true)
          setReloadNonce((n) => n + 1)
        },
      },
      {
        key: 'edit',
        label: t('common.edit'),
        onSelect: () => setEditOpen(true),
      },
    )
    return items
  })()

  return (
    <div className="installed-app-shell">
      <div className={`installed-app-toolbar ${isMobile ? 'installed-app-toolbar--mobile' : ''}`}>
        <div className="installed-app-toolbar__meta">
          <Badge tone={statusTone} size="sm" dot>
            {statusLabel}
          </Badge>
          <span className="installed-app-endpoint panel-mono" title={endpointLabel}>
            {endpointLabel}
          </span>
        </div>

        <div className="installed-app-toolbar__actions">
          <IconButton
            label={t('common.refresh')}
            onClick={() => {
              refetch()
              setReloadNonce((n) => n + 1)
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </IconButton>

          <IconButton
            label={t('appCatalog.openNewTab')}
            onClick={() => window.open(openUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>

          <ActionMenu
            label={t('common.moreActions')}
            items={overflowActions}
            loading={actionMutation.isPending || updateMutation.isPending}
          />
        </div>
      </div>

      {!isContainer && !app.useProxy ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--win-border)] bg-[var(--win-bg-soft)] px-3 py-1.5 text-[0.75rem] text-[var(--text-secondary)]">
          <span>{t('appCatalog.directModeHint')}</span>
          <Button
            size="sm"
            variant="primary"
            onClick={handleToggleProxy}
            loading={updateMutation.isPending}
          >
            {t('appCatalog.switchProxy')}
          </Button>
        </div>
      ) : null}

      <div className="installed-app-viewport">
        {isMissing ? (
          <ErrorState
            title={t('appCatalog.containerMissingError')}
            action={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={actionMutation.isPending}
                  onClick={() => handleAction('start')}
                >
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
            <span className="block font-medium text-[var(--win-text)]">
              {t('appCatalog.containerStoppedTitle')}
            </span>
            <span className="block text-[var(--text-secondary)] mb-2.5">
              {t('appCatalog.containerStoppedDesc')}
            </span>
            <Button
              variant="primary"
              loading={actionMutation.isPending}
              onClick={() => handleAction('start')}
            >
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
                try {
                  iframeRef.current?.contentWindow?.addEventListener('hashchange', syncCurrentIframeUrl)
                  iframeRef.current?.contentWindow?.addEventListener('popstate', syncCurrentIframeUrl)
                } catch {
                  // Ignore cross-origin listener restrictions
                }
              }}
              className="installed-app-frame"
              allow="clipboard-read; clipboard-write; fullscreen"
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
