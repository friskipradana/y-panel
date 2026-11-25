import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Clock, Printer } from 'lucide-react'
import { getPublicDevDoc } from '@/api/devdesk'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

function formatMoney(amount: number, currency = 'IDR') {
  if (currency === 'IDR') return `Rp ${Math.round(amount).toLocaleString('id-ID')}`
  return `${currency} ${amount.toLocaleString('en-US')}`
}

export function PublicDevDocPage() {
  const { token = '' } = useParams()
  const { t } = useI18n()
  const q = useQuery({
    queryKey: ['public-devdoc', token],
    queryFn: () => getPublicDevDoc(token),
    enabled: token.length >= 16,
    retry: false,
  })

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--win-content-bg)] p-6">
        <LoadingState>{t('common.loading')}</LoadingState>
      </div>
    )
  }

  if (q.isError || !q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--win-content-bg)] p-6">
        <ErrorState title={t('devdesk.publicNotFound')} hint={t('devdesk.publicNotFoundHint')} />
      </div>
    )
  }

  const { doc, checklist, seller } = q.data
  const subtotal = doc.items.reduce((acc, it) => acc + it.subtotal, 0)
  const dpAmount = Math.round((doc.totalAmount * doc.dpPercent) / 100)
  const remaining = Math.max(0, doc.totalAmount - doc.paidAmount)
  const isInvoice = doc.kind === 'invoice'
  const doneCount = checklist.filter((c) => c.status === 'done').length

  return (
    <div className="min-h-screen overflow-y-auto bg-[var(--win-content-bg)] px-4 py-6 text-[var(--win-text)] print:bg-white print:p-0">
      <div className="mx-auto max-w-[820px] space-y-4">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Badge tone={doc.status === 'paid' || doc.status === 'accepted' ? 'success' : doc.status === 'cancelled' ? 'danger' : 'primary'} dot>
            {t(`devdesk.status.${doc.status}`)}
          </Badge>
          <Button variant="primary" icon={<Printer className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => window.print()}>
            {t('devdesk.printPdf')}
          </Button>
        </div>

        <article className="overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--win-bar)] shadow-sm print:rounded-none print:border-none print:shadow-none">
          <div className="h-1.5 w-full bg-[var(--panel-primary-solid)]" />
          <div className="space-y-6 p-6 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--win-border)] pb-5">
              <div className="flex items-center gap-3">
                <img src="/brand/icon-192.png" alt="Reneo" width={40} height={40} className="h-10 w-10 rounded-lg" />
                <div>
                  <div className="text-base font-bold tracking-tight text-[var(--win-text)]">{seller.brand}</div>
                  <div className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">{seller.website}</div>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <h1 className="text-lg font-bold uppercase tracking-wide text-[var(--win-text)]">
                  {isInvoice ? t('devdesk.kind.invoice') : t('devdesk.kind.quotation')}
                </h1>
                <div className="panel-mono text-[0.8125rem] font-semibold text-[var(--panel-primary-text)]">{doc.docNumber}</div>
                <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">
                  {doc.issueDate ? `${t('devdesk.issueDate')}: ${doc.issueDate}` : ''}
                  {isInvoice && doc.dueDate ? ` · ${t('devdesk.dueDate')}: ${doc.dueDate}` : ''}
                  {!isInvoice && doc.validUntil ? ` · ${t('devdesk.validUntil')}: ${doc.validUntil}` : ''}
                </div>
              </div>
            </header>

            <section className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 sm:grid-cols-3">
              <div>
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  {t('devdesk.clientLabel')}
                </div>
                <div className="mt-1 text-[0.875rem] font-semibold text-[var(--win-text)]">{doc.clientName || '-'}</div>
                {doc.clientCompany ? <div className="text-[0.75rem] text-[var(--text-secondary)]">{doc.clientCompany}</div> : null}
                {doc.clientContact ? <div className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">{doc.clientContact}</div> : null}
              </div>
              <div>
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  {t('devdesk.issuedBy')}
                </div>
                <div className="mt-1 text-[0.875rem] font-semibold text-[var(--win-text)]">{seller.name}</div>
                <div className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">{seller.website}</div>
              </div>
              <div>
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  {t('devdesk.summaryHeading')}
                </div>
                <div className="mt-1 text-[0.8125rem] font-semibold text-[var(--win-text)]">{doc.title}</div>
                <div className="text-[0.75rem] text-[var(--text-secondary)]">{t(`devdesk.status.${doc.status}`)}</div>
              </div>
            </section>

            {doc.summary ? <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{doc.summary}</p> : null}

            <div className="overflow-x-auto rounded-lg border border-[var(--win-border)]">
              <table className="w-full border-collapse text-left text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-[var(--win-border)] bg-[var(--panel-surface-strong)] text-[0.75rem] font-semibold text-[var(--win-text)]">
                    <th className="px-3 py-2.5 w-10">{t('devdesk.colIndex')}</th>
                    <th className="px-3 py-2.5">{t('devdesk.itemDesc')}</th>
                    <th className="px-3 py-2.5 text-right">{t('devdesk.itemQty')}</th>
                    <th className="px-3 py-2.5 text-right">{t('devdesk.itemPrice')}</th>
                    <th className="px-3 py-2.5 text-right">{t('devdesk.itemSubtotal')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--win-border)]">
                  {doc.items.map((item, i) => (
                    <tr key={i}>
                      <td className="panel-mono px-3 py-2.5 align-top text-[var(--text-secondary)]">{i + 1}</td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="font-semibold text-[var(--win-text)]">{item.title}</div>
                        {item.description ? <div className="mt-0.5 text-[0.75rem] text-[var(--text-secondary)]">{item.description}</div> : null}
                      </td>
                      <td className="panel-mono px-3 py-2.5 align-top text-right whitespace-nowrap">
                        {item.qty} {item.unit}
                      </td>
                      <td className="panel-mono px-3 py-2.5 align-top text-right whitespace-nowrap">
                        {formatMoney(item.unitPrice, doc.currency)}
                      </td>
                      <td className="panel-mono px-3 py-2.5 align-top text-right font-semibold whitespace-nowrap">
                        {formatMoney(item.subtotal, doc.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  {t('devdesk.paymentInfoLabel')}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {doc.paymentInfo || t('devdesk.paymentInfoDefault')}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--win-border)] p-4 space-y-2 text-[0.8125rem]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t('devdesk.itemSubtotal')}</span>
                  <span className="panel-mono">{formatMoney(subtotal, doc.currency)}</span>
                </div>
                {doc.discount > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">{t('devdesk.discountLabel')}</span>
                    <span className="panel-mono text-[var(--panel-danger-text)]">-{formatMoney(doc.discount, doc.currency)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-[var(--win-border)] pt-2 text-[0.9375rem] font-bold">
                  <span>{t('devdesk.totalLabel')}</span>
                  <span className="panel-mono">{formatMoney(doc.totalAmount, doc.currency)}</span>
                </div>
                {doc.dpPercent > 0 && doc.dpPercent < 100 ? (
                  <div className="flex justify-between rounded-md border border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] px-2.5 py-1.5 font-semibold text-[var(--panel-primary-text)]">
                    <span>{t('devdesk.dpSummary', { pct: doc.dpPercent })}</span>
                    <span className="panel-mono">{formatMoney(dpAmount, doc.currency)}</span>
                  </div>
                ) : null}
                {doc.paidAmount > 0 ? (
                  <div className="flex justify-between text-[0.75rem] text-[var(--text-secondary)]">
                    <span>{t('devdesk.paidRemaining')}</span>
                    <span className="panel-mono">
                      {formatMoney(doc.paidAmount, doc.currency)} / {formatMoney(remaining, doc.currency)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {doc.terms.length > 0 ? (
              <section className="space-y-1.5">
                <h2 className="text-[0.75rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  {t('devdesk.termsLabel')}
                </h2>
                <ul className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]">
                  {doc.terms.map((term, i) => (
                    <li key={i}>- {term}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {doc.shareChecklist && checklist.length > 0 ? (
              <section className="space-y-2 border-t border-[var(--win-border)] pt-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[0.75rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    {t('devdesk.publicProgressTitle')}
                  </h2>
                  <span className="panel-mono text-[0.75rem] text-[var(--panel-primary-text)]">
                    {doneCount} / {checklist.length} ({Math.round((doneCount / checklist.length) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1.5">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[0.8125rem]">
                      {item.status === 'done' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--panel-success-text)]" strokeWidth={1.75} />
                      ) : item.status === 'doing' ? (
                        <Clock className="h-4 w-4 shrink-0 text-[var(--panel-warning-text)]" strokeWidth={1.75} />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={1.75} />
                      )}
                      <span className={item.status === 'done' ? 'line-through text-[var(--text-secondary)]' : 'text-[var(--win-text)]'}>
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  )
}
