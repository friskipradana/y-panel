import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Eye, Globe2, Landmark, Link2, ReceiptText, ShoppingCart, Store, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { listAllSubdomains, listHostingDomains, listHostingOrders, listHostingPlans, listHostingVouchers } from '@/api/hosting'
import { getDemoSettings, getSiteSettings, setSiteSettings } from '@/api/system'
import { SettingRow } from '@/components/ui/SettingRow'
import { Tabs } from '@/components/ui/Tabs'
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
import { HostingTermsCard } from '../hosting/HostingTermsCard'
import { HostingVouchersCard } from '../hosting/HostingVouchersCard'

// Hosting mode: the switch, what is still missing before selling, and the settings in sections
export function HostingTab() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [section, setSection] = useState<HostingSection>('plans')
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  const demo = useQuery({ queryKey: ['settings', 'demo'], queryFn: getDemoSettings, retry: 0 })
  const enabled = site.data?.hostingEnabled ?? false

  // counts on the section tabs; the same queries the cards use, so nothing is fetched twice
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, retry: 0, enabled })
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0, enabled })
  const subdomains = useQuery({ queryKey: ['hosting', 'subdomains'], queryFn: listAllSubdomains, retry: 0, enabled })
  const vouchers = useQuery({ queryKey: ['hosting', 'vouchers'], queryFn: listHostingVouchers, retry: 0, enabled })
  const waiting = useQuery({ queryKey: ['hosting', 'orders', 'review'], queryFn: () => listHostingOrders('review'), retry: 0, enabled, refetchInterval: 30_000 })

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
    <div className="space-y-3">
      {/* ── Single Unified Hosting Mode & Readiness Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
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
            <HostingChecklist onGo={setSection} bare />
          </>
        ) : null}
      </div>

      {enabled ? (
        <>

          <div className="overflow-x-auto">
            <Tabs
              label={t('hosting.tabs')}
              value={section}
              onChange={setSection}
              items={[
                { key: 'plans', label: t('hosting.tab.plans'), icon: <Boxes />, count: plans.data?.length },
                { key: 'domains', label: t('hosting.tab.domains'), icon: <Globe2 />, count: domains.data?.filter((domain) => domain.enabled).length },
                { key: 'subdomains', label: t('hosting.tab.subdomains'), icon: <Link2 />, count: subdomains.data?.length },
                { key: 'orders', label: t('hosting.tab.orders'), icon: <ShoppingCart />, count: waiting.data?.total },
                { key: 'vouchers', label: t('hosting.tab.vouchers'), icon: <Ticket />, count: vouchers.data?.filter((voucher) => voucher.enabled).length },
                { key: 'payment', label: t('hosting.tab.payment'), icon: <Landmark /> },
                { key: 'terms', label: t('hosting.tab.terms'), icon: <ReceiptText /> },
                { key: 'demo', label: t('hosting.tab.demo'), icon: <Eye /> },
              ]}
            />
          </div>

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
          {section === 'terms' ? <HostingTermsCard /> : null}
          {section === 'demo' ? <DemoAccountCard /> : null}
        </>
      ) : null}
    </div>
  )
}
