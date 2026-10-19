import { useQuery } from '@tanstack/react-query'
import { getPublicHosting } from '@/api/hosting'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { OrderForm } from './OrderForm'
import { OrderRequestForm } from './OrderRequestForm'

// Pressing Order always opens a form first. Where the owner takes payments on the panel it signs the buyer up;
// where orders arrive by message it collects the same details and sends them as the message.
export function OrderEntry() {
  const { t } = useI18n()
  const query = useQuery({ queryKey: ['public-hosting'], queryFn: getPublicHosting, staleTime: 30_000, retry: 0 })
  if (query.isLoading) return <LoadingState>{t('order.loading')}</LoadingState>
  if (query.isError) return <ErrorState title={t('order.loadFailed')} hint={t('order.loadFailedHint')} />
  if (!query.data?.enabled || query.data.plans.length === 0) return <ErrorState title={t('order.closed')} hint={t('order.closedHint')} />
  return query.data.selfSignup ? <OrderForm /> : <OrderRequestForm />
}
