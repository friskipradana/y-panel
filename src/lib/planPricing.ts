import type { DurationDiscount, HostingVoucher } from '@/api/hosting'

// The price of some periods of a plan, worked out the way the agent does it: the list price, minus the discount of the longest
// tier the subscription reaches, minus a voucher. The agent has the last word; this only shows the price before it is asked.

export interface PriceBreakdown {
  list: number
  durationPercent: number
  durationDiscount: number
  voucherDiscount: number
  /** What is left to pay, before the unique code */
  subtotal: number
}

export function durationPercentFor(discounts: DurationDiscount[] | undefined, periods: number): number {
  let best = 0
  for (const tier of discounts ?? []) {
    if (periods >= tier.periods && tier.percent > best) best = tier.percent
  }
  return best
}

export function priceFor(
  plan: { priceAmount: number; durationDiscounts?: DurationDiscount[] },
  periods: number,
  voucher?: Pick<HostingVoucher, 'kind' | 'value'> | null,
): PriceBreakdown {
  const list = plan.priceAmount * periods
  if (list <= 0) return { list: 0, durationPercent: 0, durationDiscount: 0, voucherDiscount: 0, subtotal: 0 }
  const durationPercent = durationPercentFor(plan.durationDiscounts, periods)
  const durationDiscount = Math.floor((list * durationPercent) / 100)
  const after = list - durationDiscount
  let voucherDiscount = 0
  if (voucher) voucherDiscount = voucher.kind === 'percent' ? Math.floor((after * voucher.value) / 100) : voucher.value
  voucherDiscount = Math.min(voucherDiscount, after)
  return { list, durationPercent, durationDiscount, voucherDiscount, subtotal: after - voucherDiscount }
}

// The biggest percent a plan gives for a long subscription; 0 when it gives none
export const maxDurationPercent = (discounts: DurationDiscount[] | undefined) => Math.max(0, ...(discounts ?? []).map((tier) => tier.percent))
