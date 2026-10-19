import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { getSiteSettings, setSiteSettings, type SiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Who the seller is on an invoice: the name, the address, a way to reach them, and a note under every invoice
export function HostingInvoiceCard() {
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  if (!site.data) return null
  // keyed by the stored values so the form follows what the agent saved
  return <InvoiceForm key={`${site.data.invoiceName}|${site.data.invoiceAddress}|${site.data.invoiceContact}|${site.data.invoiceNote}`} settings={site.data} />
}

function InvoiceForm({ settings }: { settings: SiteSettings }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState(settings.invoiceName ?? '')
  const [address, setAddress] = useState(settings.invoiceAddress ?? '')
  const [contact, setContact] = useState(settings.invoiceContact ?? '')
  const [note, setNote] = useState(settings.invoiceNote ?? '')
  const [error, setError] = useState('')

  const dirty =
    name.trim() !== (settings.invoiceName ?? '') ||
    address.trim() !== (settings.invoiceAddress ?? '') ||
    contact.trim() !== (settings.invoiceContact ?? '') ||
    note.trim() !== (settings.invoiceNote ?? '')

  const mutation = useMutation({
    mutationFn: () => setSiteSettings({ invoiceName: name.trim(), invoiceAddress: address.trim(), invoiceContact: contact.trim(), invoiceNote: note.trim() }),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'site'], data)
      setError('')
      toast.success(t('hosting.invoice.saved'))
    },
    onError: (e) => setError(apiError(e, t('settings.site.failed'))),
  })

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <div className="flex items-start gap-2.5 min-w-0">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
        <div>
          <h2 className="text-[13px] font-semibold leading-tight text-[var(--win-text)]">{t('hosting.invoice.title')}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{t('hosting.invoice.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('hosting.invoice.name')} hint={t('hosting.invoice.nameHint')}>
          <TextInput value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('hosting.invoice.contact')} hint={t('hosting.invoice.contactHint')}>
          <TextInput value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} />
        </Field>
      </div>
      <Field label={t('hosting.invoice.address')}>
        <Textarea rows={3} maxLength={240} value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label={t('hosting.invoice.note')} hint={t('hosting.invoice.noteHint')} error={error || undefined}>
        <Textarea rows={2} maxLength={240} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="flex justify-end border-t border-[var(--win-border)] pt-3.5">
        <Button variant="primary" size="sm" disabled={!dirty} loading={mutation.isPending} onClick={() => mutation.mutate()} className="!h-8">
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
