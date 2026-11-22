import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { sendEmailMessage, type EmailAccount, type EmailOverviewResponse } from '@/api/email'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

interface EmailComposeViewProps {
  overview: EmailOverviewResponse | undefined
  accounts: EmailAccount[]
  isDemo: boolean
  prefill?: { to?: string; subject?: string } | null
}

const getApiError = (err: unknown, fallback: string) => {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ? (localizeServerMessage(msg) ?? msg) : fallback
}

export function EmailComposeView({ overview, accounts, isDemo, prefill }: EmailComposeViewProps) {
  const { t } = useI18n()

  const activeAddresses = accounts.filter((a) => a.enabled).map((a) => a.address)
  const defaultFrom =
    activeAddresses[0] ||
    overview?.fromAddress ||
    (overview?.domain ? `noreply@${overview.domain}` : '')

  const [fromAddr, setFromAddr] = useState(defaultFrom)
  const [toAddr, setToAddr] = useState(prefill?.to ?? '')
  const [subject, setSubject] = useState(prefill?.subject ?? '')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (prefill) {
      if (prefill.to) setToAddr(prefill.to)
      if (prefill.subject) setSubject(prefill.subject)
    }
  }, [prefill])

  const fromOptions = Array.from(
    new Set([
      ...(overview?.fromAddress ? [overview.fromAddress] : []),
      ...(overview?.domain ? [`noreply@${overview.domain}`] : []),
      ...activeAddresses,
    ]),
  ).map((addr) => ({
    value: addr,
    label: addr,
  }))

  const sendMut = useMutation({
    mutationFn: () =>
      sendEmailMessage({
        from: fromAddr.trim() || defaultFrom,
        to: toAddr.trim(),
        subject: subject.trim(),
        body: body.trim(),
      }),
    onSuccess: (res) => {
      toast.success(t('email.compose.sent', { to: res.sentTo }))
      setToAddr('')
      setSubject('')
      setBody('')
    },
    onError: (err) => toast.error(getApiError(err, t('email.compose.failed'))),
  })

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-4">
      <div className="panel-shell-card settings-card mx-auto flex max-w-2xl flex-col !p-3.5 !gap-3.5">
        <SectionHeader
          icon={<Send />}
          title={t('email.compose.title')}
          subtitle={t('email.compose.subtitle')}
          tone="primary"
          className="mb-0"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('email.compose.fromLabel')}>
            {fromOptions.length > 0 ? (
              <Select
                value={fromAddr || defaultFrom}
                onChange={setFromAddr}
                options={fromOptions}
              />
            ) : (
              <TextInput
                mono
                value={fromAddr}
                onChange={(e) => setFromAddr(e.target.value)}
                placeholder={t('email.ph.fromAddress')}
              />
            )}
          </Field>

          <Field label={t('email.compose.toLabel')}>
            <TextInput
              mono
              value={toAddr}
              onChange={(e) => setToAddr(e.target.value)}
              placeholder={t('email.ph.testTo')}
            />
          </Field>
        </div>

        <Field label={t('email.compose.subjectLabel')}>
          <TextInput
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('email.compose.subjectPlaceholder')}
          />
        </Field>

        <Field label={t('email.compose.bodyLabel')}>
          <Textarea
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('email.compose.bodyPlaceholder')}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="primary"
            disabled={isDemo || !overview?.enabled || !toAddr.trim() || !subject.trim() || !body.trim()}
            loading={sendMut.isPending}
            icon={<Send className="h-3.5 w-3.5" />}
            onClick={() => sendMut.mutate()}
          >
            {t('email.compose.sendBtn')}
          </Button>
        </div>
      </div>
    </div>
  )
}
