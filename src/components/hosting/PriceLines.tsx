import { formatRupiah } from '@/api/hosting'
import { useI18n } from '@/lib/i18n'

interface PriceLinesProps {
  list: number
  promoPercent?: number
  promoDiscount?: number
  durationPercent?: number
  durationDiscount: number
  voucherCode?: string
  voucherDiscount: number
  /** What is left after the discounts */
  subtotal: number
  /** The unique code added to a bought order, and the total with it */
  uniqueCode?: number
  total?: number
  className?: string
}

// How a price came about: the list price, each discount, and what is left. Lines that do not apply are not shown.
export function PriceLines({ list, promoPercent, promoDiscount = 0, durationPercent, durationDiscount, voucherCode, voucherDiscount, subtotal, uniqueCode, total, className = '' }: PriceLinesProps) {
  const { t } = useI18n()
  const discounted = promoDiscount > 0 || durationDiscount > 0 || voucherDiscount > 0
  const row = (label: string, value: string, tone: 'plain' | 'discount' | 'strong' = 'plain') => (
    <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
      <span className={tone === 'strong' ? 'font-semibold text-[var(--win-text)]' : 'text-[var(--text-secondary)]'}>{label}</span>
      <span className={`panel-mono ${tone === 'discount' ? 'text-[var(--panel-success-text)]' : tone === 'strong' ? 'font-semibold text-[var(--win-text)]' : 'text-[var(--win-text)]'}`}>{value}</span>
    </div>
  )
  return (
    <div className={`space-y-1 ${className}`.trim()}>
      {discounted ? row(t('order.price.list'), formatRupiah(list)) : null}
      {promoDiscount > 0 ? row(t('order.price.promo', { percent: promoPercent ?? 0 }), `- ${formatRupiah(promoDiscount)}`, 'discount') : null}
      {durationDiscount > 0 ? row(t('order.price.durationDiscount', { percent: durationPercent ?? 0 }), `- ${formatRupiah(durationDiscount)}`, 'discount') : null}
      {voucherDiscount > 0 ? row(t('order.price.voucher', { code: voucherCode ?? '' }), `- ${formatRupiah(voucherDiscount)}`, 'discount') : null}
      {row(discounted ? t('order.price.afterDiscount') : t('order.price'), formatRupiah(subtotal), uniqueCode ? 'plain' : 'strong')}
      {uniqueCode ? row(t('order.uniqueCode'), formatRupiah(uniqueCode)) : null}
      {total !== undefined && uniqueCode ? row(t('order.payExactly'), formatRupiah(total), 'strong') : null}
    </div>
  )
}
