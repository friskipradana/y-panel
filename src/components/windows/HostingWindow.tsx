import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, CreditCard, Eye, Globe2, Landmark, Link2, ListChecks, ReceiptText, ShoppingCart, Smartphone, Ticket } from 'lucide-react'
import { listAllSubdomains, listHostingDomains, listHostingOrders, listHostingPlans, listHostingVouchers } from '@/api/hosting'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'
import type { SettingsTabKey } from './settings/constants'
import type { HostingSection } from './settings/hosting/HostingChecklist'
import { useNotificationSettings } from './settings/hooks/useNotificationSettings'
import { usePaymentSettings } from './settings/hooks/usePaymentSettings'
import { SettingsNav, type NavGroup } from './settings/SettingsNav'
import { HostingContent, HostingOverview, useHostingEnabled } from './settings/tabs/HostingTab'
import { PaymentTab, type PaymentSection } from './settings/tabs/PaymentTab'

type View = 'overview' | HostingSection | PaymentSection

const VIEWS: Record<View, { label: string; desc: string; icon: typeof Boxes }> = {
  overview: { label: 'hosting.nav.overview', desc: 'hosting.view.desc.overview', icon: ListChecks },
  plans: { label: 'hosting.tab.plans', desc: 'hosting.view.desc.plans', icon: Boxes },
  domains: { label: 'hosting.tab.domains', desc: 'hosting.view.desc.domains', icon: Globe2 },
  subdomains: { label: 'hosting.tab.subdomains', desc: 'hosting.view.desc.subdomains', icon: Link2 },
  orders: { label: 'hosting.tab.orders', desc: 'hosting.view.desc.orders', icon: ShoppingCart },
  vouchers: { label: 'hosting.tab.vouchers', desc: 'hosting.view.desc.vouchers', icon: Ticket },
  payment: { label: 'hosting.tab.payment', desc: 'hosting.view.desc.payment', icon: Landmark },
  terms: { label: 'hosting.tab.terms', desc: 'hosting.view.desc.terms', icon: ReceiptText },
  demo: { label: 'hosting.tab.demo', desc: 'hosting.view.desc.demo', icon: Eye },
  bank: { label: 'settings.payment.sectionBank', desc: 'hosting.view.desc.bank', icon: Smartphone },
  gateway: { label: 'settings.payment.sectionGateway', desc: 'hosting.view.desc.gateway', icon: CreditCard },
}

const isView = (value: unknown): value is View => typeof value === 'string' && value in VIEWS

// Selling space on this server and getting paid for it, in one window with one menu (like Settings): what is for sale on top, how
// buyers pay below. Both were tabs of Settings. An admin sees only the bank notification reader.
export function HostingWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  const openWindow = useWindowStore((s) => s.openWindow)
  const payment = usePaymentSettings({ authenticated })
  const listener = useNotificationSettings({ authenticated })
  const { enabled } = useHostingEnabled()

  // counts at the end of the lines of the menu: the same queries the sections use, so nothing is fetched twice
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, retry: 0, enabled: enabled && isSuperadmin })
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0, enabled: enabled && isSuperadmin })
  const subdomains = useQuery({ queryKey: ['hosting', 'subdomains'], queryFn: listAllSubdomains, retry: 0, enabled: enabled && isSuperadmin })
  const vouchers = useQuery({ queryKey: ['hosting', 'vouchers'], queryFn: listHostingVouchers, retry: 0, enabled: enabled && isSuperadmin })
  const orders = useQuery({ queryKey: ['hosting', 'orders', ''], queryFn: () => listHostingOrders(''), retry: 0, enabled: enabled && isSuperadmin, refetchInterval: 15_000 })

  // opened from a notice about a payment, the window starts on the bank notifications; asked again, it goes there
  const asked = win?.params?.view === 'payments' ? 'bank' : win?.params?.view
  const askedAt = win?.params?.viewRequest
  const [view, setView] = useState<View>(isView(asked) ? asked : isSuperadmin ? 'overview' : 'bank')
  useEffect(() => {
    if (isView(asked)) setView(asked)
  }, [asked, askedAt])

  const count = (n: number | undefined) => (n && n > 0 ? n : undefined)
  const sellTabs = (['overview', 'plans', 'domains', 'subdomains', 'orders', 'vouchers', 'payment', 'terms', 'demo'] as const)
    .filter((key) => key === 'overview' || enabled)
    .map((key) => ({
      key,
      label: VIEWS[key].label,
      desc: VIEWS[key].desc,
      icon: VIEWS[key].icon,
      count: key === 'plans' ? count(plans.data?.length) : key === 'domains' ? count(domains.data?.filter((d) => d.enabled).length) : key === 'subdomains' ? count(subdomains.data?.length) : key === 'orders' ? count(orders.data?.total) : key === 'vouchers' ? count(vouchers.data?.filter((v) => v.enabled).length) : undefined,
    }))
  const groups: NavGroup<View>[] = [
    ...(isSuperadmin ? [{ key: 'sell', label: 'hosting.nav.group.sell', tabs: sellTabs }] : []),
    {
      key: 'payments',
      label: 'hosting.nav.group.payments',
      tabs: (isSuperadmin ? (['bank', 'gateway'] as const) : (['bank'] as const)).map((key) => ({ key, label: VIEWS[key].label, desc: VIEWS[key].desc, icon: VIEWS[key].icon })),
    },
  ]
  const allowed = groups.flatMap((group) => group.tabs.map((tab) => tab.key))
  // never sit on a part that is not there: hosting switched off, or an account that may not see it
  const shown: View = allowed.includes(view) ? view : allowed[0]
  const current = VIEWS[shown]
  const CurrentIcon = current.icon

  // a link to another place in Settings (API tokens) opens Settings on that tab
  const openSettingsTab = (tab: SettingsTabKey) => {
    useSettingsNavStore.getState().request(tab)
    openWindow('settings')
  }

  return (
    <div className="panel-window flex flex-col h-full overflow-hidden">
      <div className="panel-window__body flex-1 min-h-0 flex flex-row overflow-hidden p-0 mobile:flex-col">
        <SettingsNav title={t('window.hosting')} groups={groups} active={shown} onSelect={setView} />

        <div className="flex-1 min-w-0 overflow-y-auto p-3.5 md:p-4 flex flex-col">
          <header className="settings-page__head shrink-0">
            <CurrentIcon size={16} className="settings-page__icon" />
            <div className="min-w-0">
              <h1 className="settings-page__title">{t(current.label)}</h1>
              <p className="settings-page__desc">{t(current.desc)}</p>
            </div>
          </header>
          {shown === 'overview' ? <HostingOverview onGo={setView} /> : null}
          {shown !== 'overview' && shown !== 'bank' && shown !== 'gateway' ? <HostingContent section={shown} /> : null}
          {shown === 'bank' || shown === 'gateway' ? (
            <PaymentTab section={shown} payment={payment} listener={listener} setActiveTab={openSettingsTab} canManageGateways={isSuperadmin} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
