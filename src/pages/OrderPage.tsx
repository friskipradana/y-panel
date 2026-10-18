import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PublicShell } from '@/components/public/PublicShell'
import { Button } from '@/components/ui/Button'
import { OrderForm } from '@/pages/order/OrderForm'
import { OrderStatus } from '@/pages/order/OrderStatus'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useI18n } from '@/lib/i18n'

// Ordering a hosting plan: the sign-up form at /order, the payment page of one order at /order/:publicId
export function OrderPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { publicId } = useParams()
  usePageMeta(`${t('order.title')} | Reneo`, t('order.subtitle'))

  return (
    <PublicShell>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft size={13} />
          <span>{t('install.back')}</span>
        </Button>
        {publicId ? <OrderStatus publicId={publicId} /> : <OrderForm />}
      </main>
    </PublicShell>
  )
}
