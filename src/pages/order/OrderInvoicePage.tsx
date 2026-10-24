import { useParams } from 'react-router-dom'
import { OrderInvoice } from '@/pages/order/OrderInvoice'

// The invoice of an order at /order/:publicId/invoice, on its own page: no header or footer, so it prints as a sheet
export function OrderInvoicePage() {
  const { publicId } = useParams()
  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--win-bg)] font-sans text-[var(--win-text)] antialiased print:h-auto print:overflow-visible print:bg-white">
      <OrderInvoice publicId={publicId ?? ''} />
    </div>
  )
}
