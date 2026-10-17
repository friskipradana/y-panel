import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Info, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { installSpeedtestCli, type SpeedServer } from '@/api/speedtest'
import { setSiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

const OOKLA_TERMS = 'https://www.speedtest.net/about/eula'

const installError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// What the superadmin must know or do before the chosen server can run: install Ookla's client,
// accept its licence, or just that the result is published somewhere
export function SpeedServerNotice({ server }: { server: SpeedServer }) {
  const { t } = useI18n()
  const qc = useQueryClient()

  const accept = useMutation({
    mutationFn: () => setSiteSettings({ ooklaLicenseAccepted: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['speedtest-servers'] })
      void qc.invalidateQueries({ queryKey: ['settings', 'site'] })
    },
    onError: () => toast.error(t('settings.site.failed')),
  })

  const install = useMutation({
    mutationFn: installSpeedtestCli,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['speedtest-servers'] })
      toast.success(t('speedtest.notice.noCli.installed'))
    },
  })

  if (server.reason === 'no-cli') {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-[var(--panel-warning-text)]/40 bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem] text-[var(--panel-warning-text)]">
        <p className="flex items-start gap-2 font-semibold">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {t('speedtest.notice.noCli.title')}
        </p>
        <p>{t('speedtest.notice.noCli.body')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Download className="h-3.5 w-3.5" />} loading={install.isPending} onClick={() => install.mutate()}>
            {t('speedtest.notice.noCli.install')}
          </Button>
          {install.isError ? <span className="min-w-0 break-words">{installError(install.error, t('speedtest.notice.noCli.failed'))}</span> : null}
        </div>
      </div>
    )
  }

  if (server.reason === 'license') {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-[var(--panel-warning-text)]/40 bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem] text-[var(--panel-warning-text)]">
        <p className="flex items-start gap-2 font-semibold">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {t('speedtest.notice.license.title')}
        </p>
        <p>{t('speedtest.notice.license.body')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={accept.isPending} onClick={() => accept.mutate()}>
            {t('speedtest.notice.license.accept')}
          </Button>
          <a href={OOKLA_TERMS} target="_blank" rel="noreferrer" className="text-[var(--panel-info-text)] underline">
            {t('speedtest.notice.license.terms')}
          </a>
        </div>
      </div>
    )
  }

  if (server.note === 'mlab-public' || server.note === 'ookla-public') {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[0.8125rem] text-[var(--text-secondary)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        {t(server.note === 'mlab-public' ? 'speedtest.notice.mlab' : 'speedtest.notice.ookla')}
      </p>
    )
  }
  return null
}
