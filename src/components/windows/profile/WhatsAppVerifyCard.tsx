import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { confirmWhatsAppVerify, disconnectWhatsApp, getMyWhatsApp, getNotifyMode, setWhatsAppMuted, startWhatsAppVerify, testWhatsApp } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const KEY = ['whatsapp', 'me']

// WhatsApp for an account whose plan follows the server: a number is proved with a code sent from the WhatsApp of the
// seller, and the notices then come from there. No phone of the account's own is connected.
export function WhatsAppVerifyCard({ groups }: { groups: readonly string[] }) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const me = useQuery({ queryKey: KEY, queryFn: getMyWhatsApp, retry: 0 })
  const mode = useQuery({ queryKey: ['notify', 'mode'], queryFn: getNotifyMode, retry: 0 })
  const [number, setNumber] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)

  const data = me.data
  const verified = !!data?.viaServer && !!data.recipient.linked
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY })
    void qc.invalidateQueries({ queryKey: ['notify', 'mode'] })
  }

  const send = useMutation({
    mutationFn: () => startWhatsAppVerify(number, language),
    onSuccess: (answer) => {
      setSentTo(answer.sentTo)
      setCode('')
      toast.success(t('notify.wa.verify.sent', { number: answer.sentTo }))
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.verify.sendFailed'))),
  })
  const confirm = useMutation({
    mutationFn: () => confirmWhatsAppVerify(code),
    onSuccess: () => {
      setSentTo(null)
      setCode('')
      setNumber('')
      setChanging(false)
      refresh()
      toast.success(t('notify.wa.verify.done'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.verify.confirmFailed'))),
  })
  const test = useMutation({
    mutationFn: testWhatsApp,
    onSuccess: () => toast.success(t('notify.wa.testQueued')),
    onError: (error) => toast.error(apiError(error, t('notify.wa.testFailed'))),
  })
  const disconnect = useMutation({
    mutationFn: disconnectWhatsApp,
    onSuccess: refresh,
    onError: (error) => toast.error(apiError(error, t('notify.wa.disconnectFailed'))),
  })
  const muted = useMutation({
    mutationFn: setWhatsAppMuted,
    onSuccess: refresh,
    onError: (error) => toast.error(apiError(error, t('notify.me.saveFailed'))),
  })

  const askDisconnect = async () => {
    const ok = await alertLib.confirm(t('notify.wa.verify.removeTitle'), t('notify.wa.verify.removeMessage'), t('notify.wa.disconnect'), t('common.cancel'), 'warning', 'profile')
    if (ok) disconnect.mutate()
  }
  const toggleGroup = (group: string) => {
    const current = data?.recipient.mutedEvents ?? []
    muted.mutate(current.includes(group) ? current.filter((g) => g !== group) : [...current, group])
  }

  const ready = !!mode.data?.serverWhatsApp
  const asking = !verified || changing

  return (
    <div className="panel-shell-card flex flex-col gap-3.5 settings-card">
      <SectionHeader
        icon={<MessageCircle />}
        title={t('notify.wa.verify.title')}
        subtitle={t('notify.wa.verify.subtitle')}
        actions={verified ? <Badge tone="success" dot>{t('notify.wa.verify.verified')}</Badge> : undefined}
      />

      {me.isLoading || mode.isLoading ? (
        <LoadingState>{t('notify.wa.loading')}</LoadingState>
      ) : me.isError || !data ? (
        <ErrorState title={t('notify.wa.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
      ) : (
        <>
          {verified && !changing ? (
            <div className="settings-inset flex flex-wrap items-center justify-between gap-2 text-[0.8125rem]">
              <div>
                <span className="block text-[0.75rem] text-[var(--text-secondary)]">{t('notify.wa.destination')}</span>
                <span className="panel-mono font-semibold text-[var(--win-text)]">{data.recipient.address}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" loading={test.isPending} onClick={() => test.mutate()}>
                  {t('notify.telegram.test')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
                  {t('notify.wa.verify.change')}
                </Button>
                <Button variant="danger-soft" size="sm" icon={<Unplug className="h-3.5 w-3.5" />} loading={disconnect.isPending} onClick={() => void askDisconnect()}>
                  {t('notify.wa.disconnect')}
                </Button>
              </div>
            </div>
          ) : null}

          {asking && !ready ? <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('notify.wa.verify.off')}</p> : null}

          {asking && ready ? (
            sentTo ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (/^\d{6}$/.test(code)) confirm.mutate()
                }}
              >
                <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('notify.wa.verify.sentTo', { number: sentTo })}</p>
                <Field label={t('notify.wa.verify.codeLabel')} htmlFor="wa-verify-code">
                  <TextInput
                    id="wa-verify-code"
                    mono
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" loading={confirm.isPending} disabled={!/^\d{6}$/.test(code)}>
                    {t('notify.wa.verify.confirm')}
                  </Button>
                  <Button type="button" variant="outline" loading={send.isPending} onClick={() => send.mutate()}>
                    {t('notify.wa.verify.resend')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setSentTo(null)}>
                    {t('notify.wa.verify.change')}
                  </Button>
                </div>
              </form>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (number.trim()) send.mutate()
                }}
              >
                <Field label={t('notify.wa.verify.numberLabel')} htmlFor="wa-verify-number" hint={t('notify.wa.verify.numberHint')}>
                  <TextInput id="wa-verify-number" mono type="tel" inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" value={number} onChange={(e) => setNumber(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" loading={send.isPending} disabled={number.trim() === ''}>
                    {t('notify.wa.verify.send')}
                  </Button>
                  {changing ? (
                    <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
                      {t('common.cancel')}
                    </Button>
                  ) : null}
                </div>
              </form>
            )
          ) : null}

          {verified && !changing ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-[0.75rem] font-medium text-[var(--text-secondary)]">{t('notify.me.which')}</p>
              {groups.map((group) => (
                <SettingRow
                  key={group}
                  title={t(`notify.group.${group}`)}
                  description={t(`notify.group.${group}.hint`)}
                  control={
                    <ToggleSwitch
                      checked={!data.recipient.mutedEvents.includes(group)}
                      disabled={muted.isPending}
                      label={t(`notify.group.${group}`)}
                      onChange={() => toggleGroup(group)}
                    />
                  }
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
