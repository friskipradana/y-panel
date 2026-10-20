import type { HostingPlan } from '@/api/hosting'

// Months added to a date, keeping the day inside the month (31 Jan + 1 month = 28 or 29 Feb)
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from)
  const day = result.getDate()
  result.setMonth(result.getMonth() + months)
  if (result.getDate() !== day) result.setDate(0)
  return result
}

// Where a plan would end if it started now: the trial days, or the periods ordered; null for a plan paid once.
// The agent counts from the moment the account is switched on, so this is an estimate.
export function validUntil(plan: Pick<HostingPlan, 'period' | 'trialDays'>, count: number, trial: boolean, from = new Date()): Date | null {
  if (trial) {
    const end = new Date(from)
    end.setDate(end.getDate() + plan.trialDays)
    return end
  }
  if (plan.period === 'once') return null
  return addMonths(from, plan.period === 'yearly' ? count * 12 : count)
}

export const formatDate = (date: Date, language: string) => date.toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'long' })
