import { useEffect, useState } from 'react'
import { CreditCard, Store } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'
import type { SettingsTabKey } from './settings/constants'
import { useNotificationSettings } from './settings/hooks/useNotificationSettings'
import { usePaymentSettings } from './settings/hooks/usePaymentSettings'
import { HostingTab } from './settings/tabs/HostingTab'
import { PaymentTab } from './settings/tabs/PaymentTab'

type View = 'hosting' | 'payments'

// Selling space on this server and getting paid for it, in one window: plans, domains, orders and vouchers; and the bank notification
// reader and payment gateways. Both were tabs of Settings. An admin sees only the payment part (the bank notification reader).
export function HostingWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  const openWindow = useWindowStore((s) => s.openWindow)
  const payment = usePaymentSettings({ authenticated })
  const listener = useNotificationSettings({ authenticated })

  // opened from a notice about a payment, the window starts on the payment part; asked again, it goes there
  const requested: View | undefined = win?.params?.view === 'payments' ? 'payments' : win?.params?.view === 'hosting' ? 'hosting' : undefined
  const requestedAt = win?.params?.viewRequest
  const [view, setView] = useState<View>(requested ?? 'hosting')
  useEffect(() => {
    if (requested) setView(requested)
  }, [requested, requestedAt])
  const shown: View = isSuperadmin ? view : 'payments'

  // a link to another place in Settings (API tokens) opens Settings on that tab
  const openSettingsTab = (tab: SettingsTabKey) => {
    useSettingsNavStore.getState().request(tab)
    openWindow('settings')
  }

  return (
    <div className="panel-window flex flex-col h-full overflow-hidden">
      <div className="panel-window__body flex-1 min-h-0 flex flex-col overflow-y-auto p-3.5 md:p-4">
        <header className="settings-page__head shrink-0">
          <Store size={16} className="settings-page__icon" />
          <div className="min-w-0">
            <h1 className="settings-page__title">{t('window.hosting')}</h1>
            <p className="settings-page__desc">{t('hosting.window.desc')}</p>
          </div>
        </header>
        {isSuperadmin ? (
          <Tabs
            className="mb-3 shrink-0"
            label={t('hosting.window.sections')}
            value={view}
            onChange={setView}
            items={[
              { key: 'hosting', label: t('settings.tabs.hosting'), icon: <Store /> },
              { key: 'payments', label: t('settings.tabs.payment'), icon: <CreditCard /> },
            ]}
          />
        ) : null}
        {shown === 'hosting' && isSuperadmin ? <HostingTab /> : null}
        {shown === 'payments' ? <PaymentTab payment={payment} listener={listener} setActiveTab={openSettingsTab} canManageGateways={isSuperadmin} /> : null}
      </div>
    </div>
  )
}
