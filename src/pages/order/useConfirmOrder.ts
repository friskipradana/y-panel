import { formatRupiah } from '@/api/hosting'
import { useDurationLabel } from '@/components/hosting/PeriodPicker'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { formatDate, validUntil } from './orderValidity'
import type { OrderFormState } from './useOrderForm'

// The last question before an order exists: what is about to be created, in a dialog that asks to go on or to go back
export function useConfirmOrder(order: OrderFormState) {
  const { t, language } = useI18n()
  const durationLabel = useDurationLabel(order.plan?.period ?? 'monthly')

  return async (): Promise<boolean> => {
    const { plan, isTrial, count, total, address, domains, needsAddress, form } = order
    if (!plan) return false
    const domain = domains.find((d) => d.zoneId === address.zoneId)?.name ?? domains[0]?.name ?? ''
    const free = isTrial || total === 0
    const until = validUntil(plan, count, isTrial)
    const lines = [
      `${t('order.plan')}: <b>${plan.name}</b>`,
      `${t('order.review.period')}: <b>${isTrial ? t('order.trialNote', { days: plan.trialDays }) : durationLabel(count)}</b>`,
      `${t('order.review.until')}: ${until ? `<b>${formatDate(until, language)}</b> (${t('order.review.estimate')})` : `<b>${t('order.review.noExpiry')}</b>`}`,
      ...(needsAddress ? [`${t('order.review.address')}: <b>https://${address.label}.${domain}</b>`] : []),
      `${t('order.username')}: <b>${form.username}</b>`,
      `${t('order.review.price')}: <b>${free ? t('hosting.landing.free') : formatRupiah(total)}</b>`,
    ]
    return alertLib.confirm(
      t(isTrial ? 'order.confirm.trialTitle' : 'order.confirm.title'),
      `${lines.join('\n')}\n\n${t('order.confirm.hint')}`,
      t(isTrial ? 'order.startTrial' : 'order.submit'),
      t('common.cancel'),
      'question',
    )
  }
}
