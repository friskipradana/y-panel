import type { DurationDiscount, HostingVoucher, PromoAppliesTo } from '@/api/hosting'

// The price of some periods of a plan, worked out the way the agent does it: the list price, minus the promo of the plan while it
// runs, minus the discount of the longest tier the subscription reaches, minus a voucher. A promo set as exclusive leaves out the
// last two. The agent has the last word; this only shows the price before it is asked.

export interface PriceBreakdown {
  list: number
  promoPercent: number
  promoDiscount: number
  promoExclusive: boolean
  durationPercent: number
  durationDiscount: number
  voucherDiscount: number
  /** What is left to pay, before the unique code */
  subtotal: number
}

export type OrderKindForPrice = 'new' | 'renew' | 'trial'

export interface PromoFields {
  promoPercent?: number
  promoEndsAt?: string | null
  promoAppliesTo?: PromoAppliesTo
  promoExclusive?: boolean
}

export function durationPercentFor(discounts: DurationDiscount[] | undefined, periods: number): number {
  let best = 0
  for (const tier of discounts ?? []) {
    if (periods >= tier.periods && tier.percent > best) best = tier.percent
  }
  return best
}

// Whether the promo of a plan runs for this kind of order now. The end date decides; after it the list price is back.
export function promoActive(plan: PromoFields, kind: OrderKindForPrice, now: number = Date.now()): boolean {
  if (!plan.promoPercent || plan.promoPercent <= 0 || !plan.promoEndsAt) return false
  if (now >= new Date(plan.promoEndsAt).getTime()) return false
  if (kind === 'new') return plan.promoAppliesTo !== 'renew'
  if (kind === 'renew') return plan.promoAppliesTo !== 'new'
  return false
}

export function priceFor(
  plan: { priceAmount: number; durationDiscounts?: DurationDiscount[] } & PromoFields,
  periods: number,
  voucher?: Pick<HostingVoucher, 'kind' | 'value'> | null,
  kind: OrderKindForPrice = 'new',
  now: number = Date.now(),
): PriceBreakdown {
  const none: PriceBreakdown = { list: 0, promoPercent: 0, promoDiscount: 0, promoExclusive: false, durationPercent: 0, durationDiscount: 0, voucherDiscount: 0, subtotal: 0 }
  const list = plan.priceAmount * periods
  if (list <= 0) return none
  let promoPercent = 0
  let promoDiscount = 0
  let promoExclusive = false
  if (promoActive(plan, kind, now)) {
    promoPercent = plan.promoPercent ?? 0
    promoDiscount = Math.floor((list * promoPercent) / 100)
    promoExclusive = !!plan.promoExclusive
  }
  const afterPromo = list - promoDiscount
  if (promoExclusive) return { ...none, list, promoPercent, promoDiscount, promoExclusive, subtotal: afterPromo }
  const durationPercent = durationPercentFor(plan.durationDiscounts, periods)
  const durationDiscount = Math.floor((afterPromo * durationPercent) / 100)
  const after = afterPromo - durationDiscount
  let voucherDiscount = 0
  if (voucher) voucherDiscount = voucher.kind === 'percent' ? Math.floor((after * voucher.value) / 100) : voucher.value
  voucherDiscount = Math.min(voucherDiscount, after)
  return { list, promoPercent, promoDiscount, promoExclusive, durationPercent, durationDiscount, voucherDiscount, subtotal: after - voucherDiscount }
}

// The biggest percent a plan gives for a long subscription; 0 when it gives none
export const maxDurationPercent = (discounts: DurationDiscount[] | undefined) => Math.max(0, ...(discounts ?? []).map((tier) => tier.percent))
