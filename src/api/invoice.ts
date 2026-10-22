import { agentApi } from './client'
import type { OrderStatus } from './hosting'

/** The invoice of an order: the same facts as the order, as a document the buyer keeps */
export interface InvoiceView {
  number: string
  status: OrderStatus
  issuedAt: string
  dueAt: string
  paidAt: string | null
  seller: { name: string; address?: string; contact?: string }
  buyer: { name: string; email?: string }
  note?: string
  kind: 'new' | 'renew' | 'trial'
  /** An upgrade paid as the price difference for the time left */
  difference?: boolean
  planName: string
  periods: number
  /** Months the order buys; 0 for a plan that does not end */
  months: number
  hostname?: string
  amountList: number
  discountPromo?: number
  discountDuration: number
  discountVoucher: number
  voucherCode?: string
  amountBase: number
  uniqueCode: number
  amountTotal: number
  /** While the invoice is unpaid: where to pay */
  payment?: { methods: { id: string; kind: 'bank' | 'ewallet'; name: string; account: string; holder: string }[] }
}

export const getOrderInvoice = (publicId: string) =>
  agentApi.get<InvoiceView>(`/api/v1/public/hosting/orders/${publicId}/invoice`).then((r) => r.data)
