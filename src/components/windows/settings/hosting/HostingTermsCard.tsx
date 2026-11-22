import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { getSiteSettings, setSiteSettings, type SiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// What happens when a plan ends, and where the "order" buttons of the landing page lead
export function HostingTermsCard() {
  const { t } = useI18n()
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  if (!site.data) return null
  // keyed by the stored values so the form follows what the agent saved
  return <TermsForm key={`${site.data.graceDays}|${site.data.orderUrl}|${site.data.orderMessage}`} settings={site.data} title={t('hosting.terms.title')} />
}

function TermsForm({ settings, title }: { settings: SiteSettings; title: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [grace, setGrace] = useState(String(settings.graceDays ?? 0))
  const [orderUrl, setOrderUrl] = useState(settings.orderUrl ?? '')
  const [orderMessage, setOrderMessage] = useState(settings.orderMessage ?? '')
  const [error, setError] = useState('')

  const safeGrace = grace ?? ''
  const safeOrderUrl = orderUrl ?? ''
  const safeOrderMessage = orderMessage ?? ''

  const graceNumber = Number(safeGrace)
  const graceValid = safeGrace.trim() !== '' && Number.isInteger(graceNumber) && graceNumber >= 0 && graceNumber <= 90
  const dirty =
    graceNumber !== (settings.graceDays ?? 0) ||
    safeOrderUrl.trim() !== (settings.orderUrl ?? '') ||
    safeOrderMessage.trim() !== (settings.orderMessage ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      setSiteSettings({
        graceDays: graceNumber,
        orderUrl: safeOrderUrl.trim(),
        orderMessage: safeOrderMessage.trim(),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'site'], data)
      void qc.invalidateQueries({ queryKey: ['public-hosting'] })
      setError('')
      toast.success(t('hosting.terms.saved'))
    },
    onError: (e) => setError(apiError(e, t('settings.site.failed'))),
  })

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <ReceiptText className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{title}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.terms.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('hosting.terms.grace')} hint={graceNumber === 0 ? t('hosting.terms.graceNone') : t('hosting.terms.graceDays', { count: graceNumber })} error={grace !== '' && !graceValid ? t('hosting.terms.graceInvalid') : undefined}>
          <TextInput mono type="number" min={0} max={90} value={grace} onChange={(e) => setGrace(e.target.value)} />
        </Field>
        <Field label={t('hosting.terms.orderUrl')} hint={t('hosting.terms.orderUrlHint')} error={error || undefined}>
          <TextInput mono value={orderUrl} onChange={(e) => setOrderUrl(e.target.value)} placeholder={t('hosting.terms.orderUrlPlaceholder')} />
        </Field>
      </div>

      <Field label={t('hosting.terms.orderMessage')} hint={t('hosting.terms.orderMessageHint')}>
        <Textarea rows={4} maxLength={600} value={orderMessage} onChange={(e) => setOrderMessage(e.target.value)} placeholder={t('hosting.order.defaultMessage')} />
      </Field>

      <div className="flex justify-end border-t border-[var(--win-border)] pt-3.5">
        <Button variant="primary" size="sm" disabled={!dirty || !graceValid} loading={mutation.isPending} onClick={() => mutation.mutate()} className="!h-8">
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
