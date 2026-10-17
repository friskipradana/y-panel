import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Store } from 'lucide-react'
import { toast } from 'sonner'
import { getDemoSettings, getSiteSettings, setSiteSettings } from '@/api/system'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { DemoAccountCard } from '../DemoAccountCard'
import { HostingDomainsCard } from '../hosting/HostingDomainsCard'
import { HostingPlansCard } from '../hosting/HostingPlansCard'
import { HostingSubdomainsCard } from '../hosting/HostingSubdomainsCard'
import { HostingTermsCard } from '../hosting/HostingTermsCard'

// Hosting mode: the switch, and what it unlocks. Everything below the switch only shows while it is on.
export function HostingTab() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  const demo = useQuery({ queryKey: ['settings', 'demo'], queryFn: getDemoSettings, retry: 0 })

  const mutation = useMutation({
    mutationFn: (hostingEnabled: boolean) => setSiteSettings({ hostingEnabled }),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'site'], data)
      // turning hosting off also turns the demo off, so everything that shows it must refetch
      void qc.invalidateQueries({ queryKey: ['settings', 'demo'] })
      void qc.invalidateQueries({ queryKey: ['public-demo'] })
      void qc.invalidateQueries({ queryKey: ['public-site'] })
      toast.success(data.hostingEnabled ? t('settings.hosting.enabledToast') : t('settings.hosting.disabledToast'))
    },
    onError: () => toast.error(t('settings.site.failed')),
  })

  const enabled = site.data?.hostingEnabled ?? false

  const toggle = async () => {
    if (enabled) {
      const demoOn = !!demo.data?.enabled
      const ok = await alertLib.confirm(
        t('settings.hosting.offConfirmTitle'),
        demoOn ? t('settings.hosting.offConfirmDemo') : t('settings.hosting.offConfirmPlain'),
        t('settings.hosting.offConfirmAction'),
        t('common.cancel'),
        'warning',
        'settings',
      )
      if (!ok) return
    }
    mutation.mutate(!enabled)
  }

  return (
    <div className="space-y-3.5">
      <div className="panel-shell-card flex flex-col gap-4 p-4.5">
        <SectionHeader icon={<Store />} title={t('settings.hosting.title')} subtitle={t('settings.hosting.subtitle')} />
        <SettingRow
          title={t('settings.hosting.toggleTitle')}
          description={enabled ? t('settings.hosting.onHint') : t('settings.hosting.offHint')}
          control={
            <ToggleSwitch
              checked={enabled}
              disabled={!site.data || mutation.isPending}
              label={t('settings.hosting.toggleTitle')}
              onChange={() => void toggle()}
            />
          }
        />
      </div>

      {enabled ? (
        <>
          <HostingPlansCard />
          <HostingDomainsCard />
          <HostingSubdomainsCard />
          <HostingTermsCard />
          <DemoAccountCard />
        </>
      ) : null}
    </div>
  )
}
