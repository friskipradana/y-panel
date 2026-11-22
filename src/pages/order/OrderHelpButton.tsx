import { useQuery } from '@tanstack/react-query'
import { MessageCircleQuestion } from 'lucide-react'
import { formatRupiah, getPublicHosting, type OrderView } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { buildOrderLink } from '@/lib/orderMessage'

// "Having trouble?": opens the contact the seller set in Hosting > Terms (a WhatsApp link, an email or a page), with a message that
// already names the order. It is not shown when the seller set no contact.
export function OrderHelpButton({ order, emphasised = false }: { order: OrderView; emphasised?: boolean }) {
  const { t } = useI18n()
  const hosting = useQuery({ queryKey: ['public-hosting'], queryFn: getPublicHosting, staleTime: 30_000, retry: 0 })
  const contact = hosting.data?.orderUrl?.trim()
  if (!contact) return null

  const message = t('order.help.message', {
    id: order.publicId,
    plan: order.planName,
    amount: order.amountTotal > 0 ? formatRupiah(order.amountTotal) : '-',
    status: t(`order.status.${order.status}.badge`),
  })
  const link = buildOrderLink(contact, message, t('order.help.subject', { id: order.publicId }))

  return (
    <Button
      type="button"
      variant={emphasised ? 'primary-soft' : 'ghost'}
      block
      icon={<MessageCircleQuestion className="h-4 w-4" />}
      onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}
    >
      {t('order.help.button')}
    </Button>
  )
}
