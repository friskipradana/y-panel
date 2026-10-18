import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, MessageCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { getWahaStatus, restartWaha, setWahaEnabled, type WahaState, type WahaStatus } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
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
export function WahaCard() {
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
    <div className="panel-shell-card flex flex-col gap-4 settings-card">
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
          {data.state === 'starting' ? <p className="text-[12px] text-[var(--text-secondary)]">{t('notify.waha.starting')}</p> : null}

          {data.state === 'running' ? (
            <dl className="grid grid-cols-3 gap-2 text-[12px]">
              {[
                [t('notify.waha.engine'), data.engine || '-'],
                [t('notify.waha.version'), data.version || '-'],
                [t('notify.waha.sessions'), String(data.sessions)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
                  <dt className="text-[11.5px] text-[var(--text-secondary)]">{label}</dt>
                  <dd className="panel-mono font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <p className="text-[12px] text-[var(--text-secondary)]">{t('notify.waha.risk')}</p>

          {on ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)] pt-3.5">
              <Button variant="outline" icon={<RotateCw className="h-3.5 w-3.5" />} loading={restart.isPending} disabled={data.state !== 'running'} onClick={() => restart.mutate()}>
                {t('notify.waha.restart')}
              </Button>
            </div>
          ) : null}

          {data.dashboardUrl ? (
            <details className="text-[12px] text-[var(--text-secondary)]">
              <summary className="cursor-pointer font-medium text-[var(--win-text)]">{t('notify.waha.dashboard')}</summary>
              <div className="mt-2 flex flex-col gap-1.5">
                <p>{t('notify.waha.dashboardHint')}</p>
                {[
                  [t('notify.waha.dashboardUrl'), data.dashboardUrl],
                  [t('notify.waha.dashboardUser'), data.dashboardUser],
                  [t('notify.waha.dashboardPassword'), data.dashboardPassword],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] py-1 pl-3 pr-1">
                    <span className="min-w-0">
                      <span className="block text-[11.5px]">{label}</span>
                      <span className="panel-mono block truncate font-semibold text-[var(--win-text)]">{value || '-'}</span>
                    </span>
                    <IconButton label={t('common.copy')} disabled={!value} onClick={() => void copyTextToClipboard(value).then(() => toast.success(t('common.copied')))}>
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  )
}
