import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { getDemoSettings, setDemoSettings } from '@/api/system'
import { IconButton } from '@/components/ui/IconButton'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

// Superadmin switch for the public read-only demo account. While it is on, the landing page
// shows the "Try the demo" button and the login page can be filled in with the demo credentials.
export function DemoAccountCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['settings', 'demo'], queryFn: getDemoSettings, retry: 0 })

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => setDemoSettings(enabled),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'demo'], data)
      void qc.invalidateQueries({ queryKey: ['public-demo'] })
      toast.success(data.enabled ? t('settings.demo.enabledToast') : t('settings.demo.disabledToast'))
    },
    onError: () => toast.error(t('settings.demo.failed')),
  })

  const data = query.data
  const copy = async (value: string) => {
    await copyTextToClipboard(value)
    toast.success(t('settings.demo.copied'))
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Eye className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('settings.demo.title')}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('settings.demo.subtitle')}</p>
          </div>
        </div>
      </div>

      <SettingRow
        title={t('settings.demo.toggleTitle')}
        description={data?.enabled ? t('settings.demo.onHint') : t('settings.demo.offHint')}
        control={
          <ToggleSwitch
            checked={!!data?.enabled}
            disabled={!data || mutation.isPending}
            label={t('settings.demo.toggleTitle')}
            onChange={() => mutation.mutate(!data?.enabled)}
          />
        }
      >
        {data?.enabled && data.password ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              { label: t('landing.demo.username'), value: data.username },
              { label: t('landing.demo.password'), value: data.password },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--win-bg)] px-3 py-2">
                <div className="min-w-0">
                  <dt className="text-[11px] text-[var(--text-secondary)]">{row.label}</dt>
                  <dd className="panel-mono truncate text-[12.5px]">{row.value}</dd>
                </div>
                <IconButton label={t('common.copy')} onClick={() => void copy(row.value)} className="!h-7 !w-7">
                  <Copy className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
          </dl>
        ) : null}
        {data?.enabled && data.source === 'env' ? (
          <p className="text-[11.5px] text-[var(--text-secondary)]">{t('settings.demo.envHint')}</p>
        ) : null}
      </SettingRow>
    </div>
  )
}
