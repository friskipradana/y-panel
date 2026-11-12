import { useState } from 'react'
import {
  ExternalLink,
  Home,
  Pencil,
  Play,
  RefreshCw,
  RotateCw,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'
import { installedAppOpenUrl } from '@/api/appCatalog'
import { InstalledAppGlyph } from '@/components/common/AppIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import { useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'

interface InstalledAppWindowProps {
  win: WindowState
}

export function InstalledAppWindow({ win }: InstalledAppWindowProps) {
  const { t } = useI18n()
  const appId = Number(win.params?.appId || 0)
  const { data, isLoading, isError, error, refetch } = useAppCatalog()
  const { actionMutation, updateMutation } = useAppCatalogMutations()

  const [reloadNonce, setReloadNonce] = useState(0)
  const [editOpen, setEditOpen] = useState(false)

  const app = data?.installed.find((item) => item.id === appId)

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
  const isRunning = !isContainer || app.containerState === 'running'
  const isMissing = isContainer && app.containerState === 'missing'
  const openUrl = installedAppOpenUrl(app)
  const iframeSrc = reloadNonce > 0
    ? `${openUrl}${openUrl.includes('?') ? '&' : '?'}_r=${reloadNonce}`
    : openUrl

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    try {
      await actionMutation.mutateAsync({ id: app.id, action })
      if (action === 'start' || action === 'restart') {
        setTimeout(() => setReloadNonce((n) => n + 1), 800)
      }
      toast.success(t('appCatalog.containerActionSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
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

  return (
    <div className="installed-app-shell">
      <div className="installed-app-toolbar">
        <div className="flex items-center gap-2 min-w-0">
          <InstalledAppGlyph iconKey={app.iconKey} iconColor={app.iconColor} size={24} />
          <span className="text-[13px] font-semibold text-[var(--win-text)] truncate">
            {app.name}
          </span>
          <Badge tone={statusTone} size="sm" dot>
            {statusLabel}
          </Badge>
          <span className="panel-mono text-[11px] text-[var(--text-secondary)] truncate hidden sm:inline">
            {app.kind === 'custom-url' ? app.targetUrl : `127.0.0.1:${app.hostPort}${app.openPath}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isContainer ? (
            isRunning ? (
              <>
                <IconButton
                  label={t('appCatalog.restartContainer')}
                  onClick={() => handleAction('restart')}
                  disabled={actionMutation.isPending}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label={t('appCatalog.stopContainer')}
                  tone="warning"
                  onClick={() => handleAction('stop')}
                  disabled={actionMutation.isPending}
                >
                  <Square className="h-3.5 w-3.5" />
                </IconButton>
              </>
            ) : (
              <IconButton
                label={t('appCatalog.startContainer')}
                tone="success"
                onClick={() => handleAction('start')}
                disabled={actionMutation.isPending || isMissing}
              >
                <Play className="h-3.5 w-3.5" />
              </IconButton>
            )
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleProxy}
              loading={updateMutation.isPending}
            >
              {app.useProxy ? t('appCatalog.switchDirect') : t('appCatalog.switchProxy')}
            </Button>
          )}

          <IconButton
            label={t('appCatalog.resetHome')}
            onClick={() => setReloadNonce((n) => n + 1)}
            disabled={!isRunning}
          >
            <Home className="h-3.5 w-3.5" />
          </IconButton>

          <IconButton
            label={t('common.refresh')}
            onClick={() => {
              refetch()
              setReloadNonce((n) => n + 1)
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </IconButton>

          <IconButton
            label={t('appCatalog.openNewTab')}
            onClick={() => window.open(openUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </IconButton>

          <IconButton label={t('common.edit')} onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="installed-app-viewport">
        {isMissing ? (
          <ErrorState
            title={t('appCatalog.containerMissingError')}
            action={
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                {t('common.refresh')}
              </Button>
            }
          />
        ) : !isRunning ? (
          <EmptyState icon={<InstalledAppGlyph iconKey={app.iconKey} iconColor={app.iconColor} size={40} />}>
            <span className="block font-medium text-[var(--win-text)]">
              {t('appCatalog.containerStoppedTitle')}
            </span>
            <span className="block text-[var(--text-secondary)] mb-2.5">
              {t('appCatalog.containerStoppedDesc')}
            </span>
            <Button
              variant="primary"
              icon={<Play className="h-3.5 w-3.5" />}
              loading={actionMutation.isPending}
              onClick={() => handleAction('start')}
            >
              {t('appCatalog.startContainer')}
            </Button>
          </EmptyState>
        ) : (
          <iframe
            key={reloadNonce}
            src={iframeSrc}
            title={app.name}
            className="installed-app-frame"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        )}
      </div>

      <InstallAppModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editingApp={app}
        onSuccessApp={() => setReloadNonce((n) => n + 1)}
      />
    </div>
  )
}

