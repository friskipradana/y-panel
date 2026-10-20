import type { HostingPlan } from '@/api/hosting'
import { addMonths } from '@/pages/order/orderValidity'

type Priced = Pick<HostingPlan, 'priceAmount' | 'period'>

// What a plan costs for one month, so a monthly and a yearly plan can be compared (the same sum the agent makes)
export function monthlyPrice(plan: Priced): number {
  if (plan.period === 'monthly') return plan.priceAmount
  if (plan.period === 'yearly') return plan.priceAmount / 12
  return 0
}

// Where a plan ends once it is renewed for some months: from its end when it still runs, from now when it has ended
export function renewedEnd(currentEnd: string | null | undefined, months: number, now = new Date()): Date {
  const current = currentEnd ? new Date(currentEnd) : null
  const base = current && current.getTime() > now.getTime() ? current : now
  return addMonths(base, months)
}

// Where the target plan would end if it is bought for some periods now, with what is left of the own plan converted
// into time on it by the ratio of the monthly prices (an estimate: the agent counts from the moment the payment is read)
export function estimateUpgradeEnd(own: Priced, target: Priced & { period: HostingPlan['period'] }, ownEndsAt: string | null | undefined, periods: number, now = new Date()): Date {
  const months = target.period === 'yearly' ? periods * 12 : periods
  const end = addMonths(now, months)
  const remaining = ownEndsAt ? new Date(ownEndsAt).getTime() - now.getTime() : 0
  const from = monthlyPrice(own)
  const to = monthlyPrice(target)
  if (remaining > 0 && from > 0 && to >= from) end.setTime(end.getTime() + (remaining * from) / to)
  return end
}
