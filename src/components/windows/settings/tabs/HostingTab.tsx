import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Store } from 'lucide-react'
import { toast } from 'sonner'
import { getDemoSettings, getSiteSettings, setSiteSettings } from '@/api/system'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { DemoAccountCard } from '../DemoAccountCard'
import { HostingChecklist, type HostingSection } from '../hosting/HostingChecklist'
import { HostingCustomDomainsCard } from '../hosting/HostingCustomDomainsCard'
import { HostingDomainsCard } from '../hosting/HostingDomainsCard'
import { HostingOrdersCard } from '../hosting/HostingOrdersCard'
import { HostingPaymentCard } from '../hosting/HostingPaymentCard'
import { HostingPlansCard } from '../hosting/HostingPlansCard'
import { HostingSubdomainsCard } from '../hosting/HostingSubdomainsCard'
import { HostingInvoiceCard } from '../hosting/HostingInvoiceCard'
import { HostingTermsCard } from '../hosting/HostingTermsCard'
import { HostingVouchersCard } from '../hosting/HostingVouchersCard'

// The switch of hosting mode and what is still missing before selling. Hosting mode is also read by the window for its menu.
export function useHostingEnabled() {
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  return { site, enabled: site.data?.hostingEnabled ?? false }
}

export function HostingOverview({ onGo }: { onGo: (section: HostingSection) => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { site, enabled } = useHostingEnabled()
  const demo = useQuery({ queryKey: ['settings', 'demo'], queryFn: getDemoSettings, retry: 0 })

  const mutation = useMutation({
    mutationFn: (hostingEnabled: boolean) => setSiteSettings({ hostingEnabled }),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'site'], data)
      // turning hosting off also turns the demo off, and turning it on adds the example plans
      void qc.invalidateQueries({ queryKey: ['settings', 'demo'] })
      void qc.invalidateQueries({ queryKey: ['public-demo'] })
      void qc.invalidateQueries({ queryKey: ['public-site'] })
      void qc.invalidateQueries({ queryKey: ['hosting', 'plans'] })
      void qc.invalidateQueries({ queryKey: ['public-hosting'] })
      toast.success(data.hostingEnabled ? t('settings.hosting.enabledToast') : t('settings.hosting.disabledToast'))
    },
    onError: () => toast.error(t('settings.site.failed')),
  })

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
    <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 mobile:flex-col mobile:items-start mobile:gap-1">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
            <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('settings.hosting.title')}</h2>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">{t('settings.hosting.subtitle')}</span>
        </div>
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
          <div className="border-t border-[var(--win-border)]" />
          <HostingChecklist onGo={onGo} bare />
        </>
      ) : null}
    </div>
  )
}

// One section of hosting; the window picks which
export function HostingContent({ section }: { section: HostingSection }) {
  return (
    <div className="space-y-3">
      {section === 'plans' ? <HostingPlansCard /> : null}
      {section === 'domains' ? (
        <>
          <HostingDomainsCard />
          <HostingCustomDomainsCard />
        </>
      ) : null}
      {section === 'subdomains' ? <HostingSubdomainsCard /> : null}
      {section === 'orders' ? <HostingOrdersCard /> : null}
      {section === 'vouchers' ? <HostingVouchersCard /> : null}
      {section === 'payment' ? <HostingPaymentCard /> : null}
      {section === 'terms' ? (
        <>
          <HostingTermsCard />
          <HostingInvoiceCard />
        </>
      ) : null}
      {section === 'demo' ? <DemoAccountCard /> : null}
    </div>
  )
}
