import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { useDurationLabel } from '@/components/hosting/PeriodPicker'
import { PriceLines } from '@/components/hosting/PriceLines'
import { VoucherField } from '@/components/hosting/VoucherField'
import { IconButton } from '@/components/ui/IconButton'
import { useI18n } from '@/lib/i18n'
import type { OrderFormState, OrderStep } from './useOrderForm'

// One group of the review: its facts as label and value, and a single pencil that goes back to the step they came from
function Group({ rows, onEdit, editLabel }: { rows: { label: string; value: ReactNode; mono?: boolean }[]; onEdit: () => void; editLabel: string }) {
  return (
    <div className="flex items-start gap-2 py-2.5">
      <dl className="grid min-w-0 flex-1 grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.8125rem]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-[var(--text-secondary)]">{row.label}</dt>
            <dd className={`min-w-0 font-medium text-[var(--win-text)] ${row.mono ? 'panel-mono break-all' : 'truncate'}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <IconButton label={editLabel} onClick={onEdit} className="shrink-0">
        <Pencil className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}

// Step 4: everything the buyer is about to order in one card, the voucher, and the price, before the order is made
export function OrderStepReview({ order }: { order: OrderFormState }) {
  const { t } = useI18n()
  const {
    plan, isTrial, count, total, price, voucherText, setVoucherText, voucherApplied, voucherAnswer, voucherValid, voucherChecking, voucherFailed,
    applyVoucher, removeVoucher, address, domains, needsAddress, form, phone, setStep,
  } = order
  const durationLabel = useDurationLabel(plan?.period ?? 'monthly')
  if (!plan) return null
  const edit = (step: OrderStep) => () => setStep(step)
  const domain = domains.find((d) => d.zoneId === address.zoneId)?.name ?? domains[0]?.name ?? ''
  const free = isTrial || plan.priceAmount === 0

  return (
    <div className="space-y-3">
      <section className="divide-y divide-[var(--win-border)] rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-1">
        <Group
          onEdit={edit('plan')}
          editLabel={`${t('order.review.edit')}: ${t('order.step.plan')}`}
          rows={[
            { label: t('order.plan'), value: plan.name },
            { label: t('order.review.period'), value: isTrial ? t('order.trialNote', { days: plan.trialDays }) : durationLabel(count) },
          ]}
        />
        {needsAddress ? (
          <Group onEdit={edit('address')} editLabel={`${t('order.review.edit')}: ${t('order.step.address')}`} rows={[{ label: t('order.review.address'), value: `https://${address.label}.${domain}`, mono: true }]} />
        ) : null}
        <Group
          onEdit={edit('account')}
          editLabel={`${t('order.review.edit')}: ${t('order.step.account')}`}
          rows={[
            { label: t('order.username'), value: form.username, mono: true },
            { label: t('order.email'), value: form.email.trim() },
            ...(phone ? [{ label: t('order.whatsapp'), value: `+${phone}`, mono: true }] : []),
            ...(form.displayName.trim() ? [{ label: t('order.displayName'), value: form.displayName.trim() }] : []),
            { label: t('order.password'), value: '•'.repeat(Math.min(form.password.length, 12)) },
          ]}
        />
        <div className="space-y-3 py-3">
          {!free ? (
            <VoucherField
              id="order-voucher"
              value={voucherText}
              onChange={setVoucherText}
              applied={voucherApplied}
              onApply={applyVoucher}
              onRemove={removeVoucher}
              answer={voucherAnswer}
              discount={price.voucherDiscount}
              checking={voucherChecking}
              failed={voucherFailed}
            />
          ) : null}
          {free ? (
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="font-semibold text-[var(--win-text)]">{t('order.review.price')}</span>
              <span className="panel-mono font-semibold text-[var(--win-text)]">{t('hosting.landing.free')}</span>
            </div>
          ) : (
            <PriceLines
              list={price.list}
              durationPercent={price.durationPercent}
              durationDiscount={price.durationDiscount}
              voucherCode={voucherValid ? voucherApplied : undefined}
              voucherDiscount={voucherValid ? price.voucherDiscount : 0}
              subtotal={price.subtotal}
            />
          )}
        </div>
      </section>

      <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
        {isTrial ? t('order.review.trialNote') : total === 0 ? t('order.review.freeNote') : t('order.review.payNote')}
      </p>
    </div>
  )
}
