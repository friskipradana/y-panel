import { useCallback, useEffect, useRef, useState } from 'react'
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
import { OrderDetected } from './OrderDetected'
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
  // a payment read while the buyer watches shows as "detected" first; a page opened on an order that was already paid goes straight to the account
  const lastStatus = useRef<string | undefined>(undefined)
  const [detected, setDetected] = useState(false)
  const leaveDetected = useCallback(() => setDetected(false), [])
  useEffect(() => {
    const current = query.data?.status
    if (current === 'paid' && (lastStatus.current === 'pending' || lastStatus.current === 'review')) setDetected(true)
    if (current) lastStatus.current = current
  }, [query.data?.status])

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
  const showDetected = detected && status === 'paid'

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{showDetected ? t('order.detected.title') : t(`order.status.${status}.title`)}</h1>
          <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{showDetected ? t('order.detected.hint', { plan: order.planName }) : t(`order.status.${status}.hint`, { plan: order.planName })}</p>
        </div>
        <Badge tone={showDetected ? 'info' : TONE[status]} dot>
          {showDetected ? t('order.detected.badge') : t(`order.status.${status}.badge`)}
        </Badge>
      </div>

      {status === 'pending' || status === 'review' || status === 'paid' ? <OrderProgress status={showDetected ? 'review' : status} /> : null}

      {/* the panel address is where the buyer signs in, so it belongs to the page of a paid order, not to the way to pay */}
      {order.hostname && status === 'paid' && !showDetected ? (
        <div className="border-y border-[var(--win-border)] py-3">
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
            help={<OrderHelpButton order={order} emphasised={Date.now() - (checkingSince ?? Date.now()) >= 5 * 60_000} />}
          />
        </>
      ) : null}

      {status === 'review' ? <OrderHelpButton order={order} /> : null}

      {status === 'review' ? (
        <p className="text-[0.75rem] text-[var(--text-secondary)]">
          {t('order.expiresAt')} <DateTimeText value={order.expiresAt} />
        </p>
      ) : null}

      {showDetected ? <OrderDetected amount={order.amountTotal} planName={order.planName} onContinue={leaveDetected} /> : null}

      {status === 'paid' && !showDetected ? (
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
