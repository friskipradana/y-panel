import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CircleCheck, FileText } from 'lucide-react'
import { getPublicOrder, notifyOrderTransferred } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { OrderChecking } from './OrderChecking'
import { OrderHelpButton } from './OrderHelpButton'
import { OrderProgress } from './OrderProgress'
import { PaymentInstructions } from './PaymentInstructions'

const TONE = { pending: 'warning', review: 'info', paid: 'success', expired: 'neutral', cancelled: 'neutral' } as const

// Where the buyer pressed "I have transferred" is kept for the tab, so a reload does not send them back to the way to pay
const checkingKey = (publicId: string) => `order-checking-${publicId}`
function readChecking(publicId: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(checkingKey(publicId))
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}
function writeChecking(publicId: string, value: number | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(checkingKey(publicId))
    else window.sessionStorage.setItem(checkingKey(publicId), String(value))
  } catch {
    // without storage the page still works; a reload just shows the way to pay again
  }
}

// The page of one order: what to pay and where while it waits, the check once the buyer says they transferred, the outcome once settled
export function OrderStatus({ publicId }: { publicId: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [checkingSince, setCheckingSince] = useState<number | null>(() => readChecking(publicId))
  const query = useQuery({
    queryKey: ['public-order', publicId],
    queryFn: () => getPublicOrder(publicId),
    retry: 0,
    refetchInterval: (q) => (q.state.data?.status === 'pending' || q.state.data?.status === 'review' ? 5000 : false),
  })
  const transferred = useMutation({ mutationFn: () => notifyOrderTransferred(publicId) })
  const order = query.data

  if (query.isLoading) return <LoadingState>{t('order.loading')}</LoadingState>
  if (query.isError || !order) return <ErrorState title={t('order.notFound')} hint={t('order.notFoundHint')} />

  const status = order.status
  const setChecking = (value: number | null) => {
    setCheckingSince(value)
    writeChecking(publicId, value)
  }
  const iHaveTransferred = () => {
    setChecking(Date.now())
    // the seller is told once; whether it worked changes nothing for the buyer, the page keeps checking by itself
    transferred.mutate()
  }
  const checking = status === 'pending' && checkingSince !== null

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

      {status === 'pending' || status === 'review' || status === 'paid' ? <OrderProgress status={status} /> : null}

      {/* the panel address is where the buyer signs in, so it belongs to the page of a paid order, not to the way to pay */}
      {order.hostname && status === 'paid' ? (
        <div className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-3">
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.hostname')}</p>
          <p className="panel-mono truncate text-[0.9375rem] font-semibold text-[var(--win-text)]">https://{order.hostname}</p>
          <p className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{t('order.hostnameWait')}</p>
        </div>
      ) : null}

      {status === 'pending' && !checking ? (
        <>
          <PaymentInstructions order={order} />
          <div className="space-y-2">
            <Button type="button" variant="primary" size="lg" block icon={<CircleCheck className="h-4 w-4" />} onClick={iHaveTransferred}>
              {t('order.transferred')}
            </Button>
            <OrderHelpButton order={order} />
          </div>
        </>
      ) : null}

      {checking ? (
        <>
          <OrderChecking
            order={order}
            checkedAt={query.dataUpdatedAt}
            refreshing={query.isFetching}
            since={checkingSince ?? Date.now()}
            onRefresh={() => void query.refetch()}
            onBack={() => setChecking(null)}
          />
          <OrderHelpButton order={order} emphasised={Date.now() - (checkingSince ?? Date.now()) >= 5 * 60_000} />
        </>
      ) : null}

      {status === 'review' ? <OrderHelpButton order={order} /> : null}

      {checking || status === 'review' ? (
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
      <Button variant="outline" block icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/order/${publicId}/invoice`)}>
        {t('invoice.view')}
      </Button>
    </div>
  )
}
