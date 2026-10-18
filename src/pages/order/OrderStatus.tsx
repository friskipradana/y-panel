import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getPublicOrder } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { PaymentInstructions } from './PaymentInstructions'

const TONE = { pending: 'warning', review: 'info', paid: 'success', expired: 'neutral', cancelled: 'neutral' } as const

// The page of one order: what to pay and where while it waits, the outcome once it is settled
export function OrderStatus({ publicId }: { publicId: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['public-order', publicId],
    queryFn: () => getPublicOrder(publicId),
    retry: 0,
    refetchInterval: (q) => (q.state.data?.status === 'pending' || q.state.data?.status === 'review' ? 5000 : false),
  })
  const order = query.data

  if (query.isLoading) return <LoadingState>{t('order.loading')}</LoadingState>
  if (query.isError || !order) return <ErrorState title={t('order.notFound')} hint={t('order.notFoundHint')} />

  const status = order.status

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t(`order.status.${status}.title`)}</h1>
          <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t(`order.status.${status}.hint`, { plan: order.planName })}</p>
        </div>
        <Badge tone={TONE[status]} dot>
          {t(`order.status.${status}.badge`)}
        </Badge>
      </div>

      {order.hostname ? (
        <div className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-3">
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.hostname')}</p>
          <p className="panel-mono truncate text-[0.9375rem] font-semibold text-[var(--win-text)]">https://{order.hostname}</p>
          {status === 'paid' ? <p className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{t('order.hostnameWait')}</p> : null}
        </div>
      ) : null}

      {status === 'pending' ? <PaymentInstructions order={order} /> : null}

      {status === 'pending' || status === 'review' ? (
        <p className="text-[0.75rem] text-[var(--text-secondary)]">
          {t('order.expiresAt')} <DateTimeText value={order.expiresAt} />
        </p>
      ) : null}

      {status === 'paid' ? (
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => (order.hostname ? window.location.assign(`https://${order.hostname}/login`) : navigate('/login'))}
        >
          {order.hostname ? t('order.signInAt', { host: order.hostname }) : t('order.signIn')}
        </Button>
      ) : null}
      {status === 'expired' || status === 'cancelled' ? (
        <Button variant="primary" size="lg" block onClick={() => navigate('/order')}>
          {t('order.again')}
        </Button>
      ) : null}
    </div>
  )
}
