import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Info, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { installSpeedtestCli, type SpeedServer } from '@/api/speedtest'
import { setSiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/IconBadge'
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
      <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--panel-warning-text)_25%,transparent)] bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem] text-[var(--panel-warning-text)]">
        <IconBadge size="sm" tone="warning">
          <TriangleAlert size={14} />
        </IconBadge>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">{t('speedtest.notice.noCli.title')}</p>
          <p className="text-[12px] opacity-90 leading-relaxed">{t('speedtest.notice.noCli.body')}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="primary"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              loading={install.isPending}
              onClick={() => install.mutate()}
            >
              {t('speedtest.notice.noCli.install')}
            </Button>
            {install.isError ? (
              <span className="min-w-0 break-words text-[12px]">
                {installError(install.error, t('speedtest.notice.noCli.failed'))}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  if (server.reason === 'license') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--panel-warning-text)_25%,transparent)] bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem] text-[var(--panel-warning-text)]">
        <IconBadge size="sm" tone="warning">
          <TriangleAlert size={14} />
        </IconBadge>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">{t('speedtest.notice.license.title')}</p>
          <p className="text-[12px] opacity-90 leading-relaxed">{t('speedtest.notice.license.body')}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="primary" size="sm" loading={accept.isPending} onClick={() => accept.mutate()}>
              {t('speedtest.notice.license.accept')}
            </Button>
            <a
              href={OOKLA_TERMS}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--panel-info-text)] hover:underline text-[12px]"
            >
              {t('speedtest.notice.license.terms')}
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (server.note === 'mlab-public' || server.note === 'ookla-public') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[0.8125rem] text-[var(--text-secondary)]">
        <IconBadge size="sm" tone="neutral">
          <Info size={14} />
        </IconBadge>
        <p className="flex-1 text-[12px] leading-relaxed">
          {t(server.note === 'mlab-public' ? 'speedtest.notice.mlab' : 'speedtest.notice.ookla')}
        </p>
      </div>
    )
  }

  return null
}
