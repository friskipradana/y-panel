import { useQuery } from '@tanstack/react-query'
import { formatRupiah, listAllSubdomains, listHostingDomains, listHostingOrders, listHostingPlans, listHostingVouchers } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import type { HostingSection } from './HostingChecklist'
import { StatusPill } from './HostingTableKit'

const TONE = { pending: 'warning', review: 'info', paid: 'success', expired: 'neutral', cancelled: 'neutral' } as const

// What is going on in the business, from the same lists the sections use: what waits for a decision, the latest orders, and what is for sale
export function HostingSummary({ onGo }: { onGo: (section: HostingSection) => void }) {
  const { t } = useI18n()
  const orders = useQuery({ queryKey: ['hosting', 'orders', ''], queryFn: () => listHostingOrders(''), retry: 0, refetchInterval: 15_000 })
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, retry: 0 })
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })
  const subdomains = useQuery({ queryKey: ['hosting', 'subdomains'], queryFn: listAllSubdomains, retry: 0 })
  const vouchers = useQuery({ queryKey: ['hosting', 'vouchers'], queryFn: listHostingVouchers, retry: 0 })

  const list = orders.data?.items ?? []
  const review = list.filter((order) => order.status === 'review').length
  const pending = list.filter((order) => order.status === 'pending').length
  const recent = list.slice(0, 6)

  const forSale: { key: HostingSection; label: string; value: string | undefined }[] = [
    { key: 'plans', label: t('hosting.summary.plans'), value: plans.data ? t('hosting.summary.of', { shown: plans.data.filter((plan) => plan.visible).length, all: plans.data.length }) : undefined },
    { key: 'domains', label: t('hosting.summary.domains'), value: domains.data ? String(domains.data.filter((domain) => domain.enabled).length) : undefined },
    { key: 'subdomains', label: t('hosting.summary.subdomains'), value: subdomains.data ? String(subdomains.data.length) : undefined },
    { key: 'vouchers', label: t('hosting.summary.vouchers'), value: vouchers.data ? String(vouchers.data.filter((voucher) => voucher.enabled).length) : undefined },
  ]

  const heading = 'text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]'
  return (
    <div className="@container">
      <div className="grid gap-x-6 gap-y-5 @[600px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section aria-label={t('hosting.summary.attention')}>
            <h2 className={heading}>{t('hosting.summary.attention')}</h2>
            {orders.isError ? (
              <p role="alert" className="mt-2 text-[12px] text-[var(--panel-danger-text)]">{t('hosting.orders.loadFailed')}</p>
            ) : review + pending === 0 ? (
              <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{t('hosting.summary.nothing')}</p>
            ) : (
              <ul className="mt-1 divide-y divide-[var(--win-border)]">
                {review > 0 ? (
                  <li className="flex items-center justify-between gap-3 py-2 text-[0.8125rem]">
                    <span className="text-[var(--win-text)]">{t('hosting.summary.review', { count: review })}</span>
                    <Button variant="ghost" size="sm" onClick={() => onGo('orders')}>{t('hosting.summary.open')}</Button>
                  </li>
                ) : null}
                {pending > 0 ? (
                  <li className="flex items-center justify-between gap-3 py-2 text-[0.8125rem]">
                    <span className="text-[var(--win-text)]">{t('hosting.summary.pending', { count: pending })}</span>
                    <Button variant="ghost" size="sm" onClick={() => onGo('orders')}>{t('hosting.summary.open')}</Button>
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          <section aria-label={t('hosting.summary.recent')}>
            <h2 className={heading}>{t('hosting.summary.recent')}</h2>
            {recent.length === 0 ? (
              <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{orders.isLoading ? t('hosting.orders.loading') : t('hosting.summary.noOrders')}</p>
            ) : (
              <ul className="mt-1 divide-y divide-[var(--win-border)]">
                {recent.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[0.8125rem] font-semibold text-[var(--win-text)]">{order.username || '-'}</p>
                      <p className="truncate text-[11.5px] text-[var(--text-secondary)]">
                        {order.planName} · {t(`hosting.orders.kind.${order.kind}`)} · {formatDateTimeID(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="panel-mono text-[0.75rem] text-[var(--win-text)]">{order.amountTotal > 0 ? formatRupiah(order.amountTotal) : t('hosting.landing.free')}</span>
                      <StatusPill tone={TONE[order.status]}>{t(`hosting.orders.status.${order.status}`)}</StatusPill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-label={t('hosting.summary.forSale')} className="min-w-0">
          <h2 className={heading}>{t('hosting.summary.forSale')}</h2>
          <ul className="mt-1 divide-y divide-[var(--win-border)]">
            {forSale.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 py-2 text-[0.8125rem]">
                <span className="text-[var(--text-secondary)]">{row.label}</span>
                <span className="flex items-center gap-2">
                  <span className="panel-mono font-semibold text-[var(--win-text)]">{row.value ?? '-'}</span>
                  <Button variant="ghost" size="sm" onClick={() => onGo(row.key)}>{t('hosting.summary.open')}</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
