import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, MessageCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { getWahaStatus, restartWaha, setWahaEnabled, type WahaState, type WahaStatus } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { WahaDashboard } from './WahaDashboard'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const STATE_TONE: Record<WahaState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  running: 'success',
  starting: 'warning',
  error: 'danger',
  stopped: 'neutral',
  off: 'neutral',
}

// The WhatsApp runtime (WAHA) the panel runs as one container: the switch, what runs, and the dashboard for the owner
export function WahaCard({ bare }: { bare?: boolean } = {}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const status = useQuery({
    queryKey: ['notify', 'waha'],
    queryFn: getWahaStatus,
    retry: 0,
    refetchInterval: (query) => (query.state.data?.state === 'starting' ? 3000 : 15000),
  })
  const set = (data: WahaStatus) => qc.setQueryData(['notify', 'waha'], data)

  const toggle = useMutation({
    mutationFn: setWahaEnabled,
    onSuccess: (data) => {
      set(data)
      void qc.invalidateQueries({ queryKey: ['notify', 'overview'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.waha.saveFailed'))),
  })
  const restart = useMutation({
    mutationFn: restartWaha,
    onSuccess: (data) => {
      set(data)
      toast.success(t('notify.waha.restarted'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.waha.restartFailed'))),
  })

  const data = status.data
  const on = !!data?.enabled
  const flip = async () => {
    if (on) {
      const ok = await alertLib.confirm(t('notify.waha.offTitle'), t('notify.waha.offMessage'), t('notify.waha.off'), t('common.cancel'), 'warning', 'settings')
      if (!ok) return
    }
    toggle.mutate(!on)
  }

  return (
    <div className={bare ? 'flex flex-col gap-3' : 'panel-shell-card flex flex-col gap-3.5 settings-card'}>
      <SectionHeader
        icon={<MessageCircle />}
        title={t('notify.waha.title')}
        subtitle={t('notify.waha.subtitle')}
        actions={data ? <Badge tone={STATE_TONE[data.state]} dot>{t(`notify.waha.state.${data.state}`)}</Badge> : undefined}
      />

      {status.isLoading ? (
        <LoadingState>{t('notify.waha.loading')}</LoadingState>
      ) : status.isError || !data ? (
        <ErrorState title={t('notify.waha.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
      ) : (
        <>
          {data.lastError ? (
            <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">
              {data.lastError}
            </p>
          ) : null}

          <SettingRow
            title={t('notify.waha.enable')}
            description={t('notify.waha.enableHint')}
            control={<ToggleSwitch checked={on} disabled={toggle.isPending || data.state === 'starting'} label={t('notify.waha.enable')} onChange={() => void flip()} />}
          />
          {data.state === 'starting' ? (
            <p className="text-[12px] text-[var(--text-secondary)]">{data.containerState ? t('notify.waha.booting') : t('notify.waha.starting')}</p>
          ) : null}
          {data.state === 'error' && data.logTail ? (
            <details className="text-[12px] text-[var(--text-secondary)]">
              <summary className="cursor-pointer font-medium text-[var(--win-text)]">{t('notify.waha.logs')}</summary>
              <pre className="panel-mono mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-2.5 text-[11px] leading-relaxed">{data.logTail}</pre>
            </details>
          ) : null}

          {data.state === 'running' ? (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.waha.engine')}:</span>
                  <span className="panel-mono font-semibold text-[var(--win-text)]">{data.engine || '-'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.waha.version')}:</span>
                  <span className="panel-mono font-semibold text-[var(--win-text)]">{data.version || '-'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.waha.sessions')}:</span>
                  <span className="panel-mono font-semibold text-[var(--win-text)]">{data.sessions}</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<RotateCw className="h-3.5 w-3.5" />}
                loading={restart.isPending}
                disabled={restart.isPending}
                onClick={() => restart.mutate()}
              >
                {t('notify.waha.restart')}
              </Button>
            </div>
          ) : on && data.state === 'error' ? (
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                icon={<RotateCw className="h-3.5 w-3.5" />}
                loading={restart.isPending}
                onClick={() => restart.mutate()}
              >
                {t('notify.waha.restart')}
              </Button>
            </div>
          ) : null}

          <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{t('notify.waha.risk')}</p>

          {data.dashboardUrl ? (
            <details className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-2.5 text-[12px]">
              <summary className="cursor-pointer font-medium text-[var(--win-text)] hover:text-[var(--panel-primary-text)] select-none transition-colors">
                {t('notify.waha.dashboard')}
              </summary>
              <div className="mt-2.5 flex flex-col gap-3 border-t border-[var(--win-border)] pt-2.5">
                <WahaDashboard running={data.state === 'running'} />

                <div className="flex flex-col gap-1.5">
                  <p className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.waha.dashboardHint')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      [t('notify.waha.dashboardUrl'), data.dashboardUrl],
                      [t('notify.waha.dashboardUser'), data.dashboardUser],
                      [t('notify.waha.dashboardPassword'), data.dashboardPassword],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--win-content-bg)] px-3 py-2 text-[12px]">
                        <div className="min-w-0 flex-1">
                          <span className="block text-[11px] text-[var(--text-secondary)]">{label}</span>
                          <span className="panel-mono block truncate font-medium text-[var(--win-text)]" title={value}>{value || '-'}</span>
                        </div>
                        <IconButton
                          label={t('common.copy')}
                          disabled={!value}
                          onClick={() => void copyTextToClipboard(value).then(() => toast.success(t('common.copied')))}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  )
}
