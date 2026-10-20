import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { checkPublicSubdomain } from '@/api/hosting'
import { SubdomainPicker } from '@/components/hosting/SubdomainPicker'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { OrderStepAccount } from './OrderStepAccount'
import { OrderStepPlan } from './OrderStepPlan'
import { OrderStepReview } from './OrderStepReview'
import { useConfirmOrder } from './useConfirmOrder'
import { useOrderForm } from './useOrderForm'

// Sign-up of a buyer in steps (plan, address, account, review): the account is made when the order is confirmed and
// switched on when the payment arrives (or the trial starts)
export function OrderForm() {
  const { t } = useI18n()
  const order = useOrderForm()
  const confirmOrder = useConfirmOrder(order)
  const { restored, query, plan, step, steps, index, valid, canOpen, next, back, submit, isTrial, domains, address, setAddress, setStep } = order

  if (query.isLoading) return <LoadingState>{t('order.loading')}</LoadingState>
  if (query.isError) return <ErrorState title={t('order.loadFailed')} hint={t('order.loadFailedHint')} />
  if (!query.data?.enabled || !query.data.selfSignup || !plan) {
    return <ErrorState title={t('order.closed')} hint={t('order.closedHint')} />
  }

  const last = index === steps.length - 1
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!last) next()
    else if (valid.review && !submit.isPending) void confirmOrder().then((ok) => ok && submit.mutate())
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('order.title')}</h1>
        <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('order.subtitle')}</p>
      </div>

      {restored ? <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('order.draft.restored')}</p> : null}

      <Stepper
        label={t('order.steps')}
        value={step}
        onChange={setStep}
        canSelect={(key) => canOpen(key)}
        items={steps.map((key) => ({ key, label: t(`order.step.${key}`) }))}
      />

      {step === 'plan' ? <OrderStepPlan order={order} /> : null}
      {step === 'address' ? (
        <section className="space-y-3">
          <div>
            <p className="panel-section-label">{t('order.address')}</p>
            <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('order.addressHint')}</p>
          </div>
          <SubdomainPicker domains={domains} check={checkPublicSubdomain} onChange={setAddress} initialLabel={address.label} initialZoneId={address.zoneId} />
        </section>
      ) : null}
      {step === 'account' ? <OrderStepAccount order={order} /> : null}
      {step === 'review' ? <OrderStepReview order={order} /> : null}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" className="-ml-2.5" icon={<ArrowLeft className="h-4 w-4" />} disabled={index === 0 || submit.isPending} onClick={back}>
          {t('common.previous')}
        </Button>
        {last ? (
          <Button type="submit" variant="primary" size="lg" loading={submit.isPending} disabled={!valid.review}>
            {isTrial ? t('order.startTrial') : t('order.submit')}
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!valid[step]}>
            {t('common.next')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </form>
  )
}
