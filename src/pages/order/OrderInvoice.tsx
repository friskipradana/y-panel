import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatRupiah } from '@/api/hosting'
import { getOrderInvoice, type InvoiceView } from '@/api/invoice'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { usePageMeta } from '@/hooks/usePageMeta'
import { formatDateID } from '@/lib/datetime'
import { monthsLabel } from '@/lib/duration'
import { useI18n } from '@/lib/i18n'

// One line of the invoice: what it is, and its amount (a discount is shown as a minus)
function Line({ label, hint, amount, strong }: { label: string; hint?: string; amount: string; strong?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2 ${strong ? 'font-semibold' : ''}`}>
      <div className="min-w-0">
        <p className="break-words">{label}</p>
        {hint ? <p className="text-[0.75rem] opacity-70">{hint}</p> : null}
      </div>
      <p className="panel-mono shrink-0 text-right">{amount}</p>
    </div>
  )
}

function Party({ title, name, lines }: { title: string; name: string; lines: (string | undefined)[] }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide opacity-60">{title}</p>
      <p className="mt-1 break-words font-semibold">{name}</p>
      {lines.filter(Boolean).map((line, i) => (
        <p key={i} className="whitespace-pre-line break-words text-[0.8125rem] opacity-80">{line}</p>
      ))}
    </div>
  )
}

function Sheet({ invoice }: { invoice: InvoiceView }) {
  const { t } = useI18n()
  const free = invoice.amountTotal <= 0
  const period = invoice.difference ? t('invoice.difference') : invoice.kind === 'trial' ? t('hosting.orders.kind.trial') : invoice.months > 0 ? monthsLabel(t, invoice.months) : t('invoice.oneTime')
  return (
    <article className="invoice-paper mx-auto w-full max-w-[44rem] rounded-2xl border border-[var(--win-border)] p-5 text-[0.875rem] sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Party title={t('invoice.from')} name={invoice.seller.name} lines={[invoice.seller.address, invoice.seller.contact]} />
        <div className="text-left sm:text-right">
          <h1 className="text-xl font-bold tracking-tight">{t('invoice.title')}</h1>
          <p className="panel-mono mt-1 text-[0.8125rem]">{invoice.number}</p>
          <p className="mt-2 inline-block rounded-md border border-[var(--win-border)] px-2 py-0.5 text-[0.75rem] font-semibold uppercase tracking-wide">
            {t(`hosting.orders.status.${invoice.status}`)}
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Party title={t('invoice.billedTo')} name={invoice.buyer.name} lines={[invoice.buyer.email]} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.8125rem] sm:text-right">
          <dt className="opacity-60">{t('invoice.issued')}</dt>
          <dd>{formatDateID(invoice.issuedAt)}</dd>
          {invoice.paidAt ? (
            <>
              <dt className="opacity-60">{t('invoice.paidOn')}</dt>
              <dd>{formatDateID(invoice.paidAt)}</dd>
            </>
          ) : invoice.status === 'pending' ? (
            <>
              <dt className="opacity-60">{t('invoice.due')}</dt>
              <dd>{formatDateID(invoice.dueAt)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="mt-6 divide-y divide-[var(--win-border)] border-y border-[var(--win-border)]">
        <Line
          label={t('invoice.plan', { plan: invoice.planName })}
          hint={`${t(`hosting.orders.kind.${invoice.kind}`)} · ${period}${invoice.hostname ? ` · ${invoice.hostname}` : ''}`}
          amount={free && invoice.amountList <= 0 ? t('hosting.landing.free') : formatRupiah(invoice.amountList)}
        />
        {invoice.discountDuration > 0 ? <Line label={t('invoice.durationDiscount')} amount={`- ${formatRupiah(invoice.discountDuration)}`} /> : null}
        {invoice.discountVoucher > 0 ? <Line label={t('invoice.voucher', { code: invoice.voucherCode ?? '' })} amount={`- ${formatRupiah(invoice.discountVoucher)}`} /> : null}
        {invoice.uniqueCode > 0 && !free ? <Line label={t('invoice.uniqueCode')} hint={t('invoice.uniqueCodeHint')} amount={formatRupiah(invoice.uniqueCode)} /> : null}
        <Line strong label={t('invoice.total')} amount={free ? t('hosting.landing.free') : formatRupiah(invoice.amountTotal)} />
      </section>

      {invoice.payment && invoice.payment.methods.length > 0 ? (
        <section className="mt-6">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide opacity-60">{t('invoice.payTo')}</p>
          <ul className="mt-2 space-y-1.5">
            {invoice.payment.methods.map((method) => (
              <li key={method.id} className="text-[0.8125rem]">
                <span className="font-semibold">{method.name}</span> <span className="panel-mono">{method.account}</span> · {method.holder}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.75rem] opacity-70">{t('invoice.payNote', { amount: formatRupiah(invoice.amountTotal) })}</p>
        </section>
      ) : null}

      {invoice.note ? <p className="mt-6 whitespace-pre-line border-t border-[var(--win-border)] pt-4 text-[0.8125rem] opacity-80">{invoice.note}</p> : null}
    </article>
  )
}

// The invoice of one order, at /order/:publicId/invoice: a page that prints (or saves as PDF) as a clean sheet
export function OrderInvoice({ publicId }: { publicId: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  usePageMeta(`${t('invoice.title')} | Reneo`, t('invoice.subtitle'))
  const query = useQuery({ queryKey: ['public-invoice', publicId], queryFn: () => getOrderInvoice(publicId), retry: 0 })

  return (
    <main className="mx-auto min-h-full w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate(`/order/${publicId}`)}>
          {t('invoice.back')}
        </Button>
        {query.data ? (
          <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            {t('invoice.print')}
          </Button>
        ) : null}
      </div>
      {query.isLoading ? <LoadingState>{t('invoice.loading')}</LoadingState> : null}
      {query.isError || (!query.isLoading && !query.data) ? <ErrorState title={t('invoice.notFound')} hint={t('order.notFoundHint')} /> : null}
      {query.data ? <Sheet invoice={query.data} /> : null}
    </main>
  )
}
