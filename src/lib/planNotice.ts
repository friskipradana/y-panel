import type { MyPlanView } from '@/api/hosting'

// A plan that ends within this many days is called "expiring"
export const EXPIRING_DAYS = 7

// Whole days until a date, at least 1 while it is still ahead; 0 once it has passed
export function daysUntil(end: string | null | undefined, now = Date.now()): number {
  if (!end) return 0
  const left = new Date(end).getTime() - now
  return Number.isNaN(left) || left <= 0 ? 0 : Math.max(1, Math.ceil(left / 86_400_000))
}

export type PlanNoticeKind = 'expiring' | 'grace' | 'expired'

export interface PlanNotice {
  kind: PlanNoticeKind
  /** Whole days left, at least 1; only for "expiring" */
  days: number
  end: string | null
  graceEnd: string | null
}

// What the buyer should be told about the plan, if anything: ending soon, in the grace period, or ended.
// A trial pauses the own plan, so nothing is said while it runs.
export function planNotice(plan: MyPlanView | undefined, now = Date.now()): PlanNotice | null {
  if (!plan?.plan || plan.trial) return null
  const end = plan.expiresAt ?? null
  if (plan.state === 'grace') return { kind: 'grace', days: 0, end, graceEnd: plan.graceEndsAt ?? null }
  if (plan.state === 'expired') return { kind: 'expired', days: 0, end, graceEnd: null }
  if (plan.state === 'active' && end) {
    const left = new Date(end).getTime() - now
    if (Number.isNaN(left)) return null
    const days = Math.max(1, Math.ceil(left / 86_400_000))
    if (days <= EXPIRING_DAYS) return { kind: 'expiring', days, end, graceEnd: null }
  }
  return null
}
