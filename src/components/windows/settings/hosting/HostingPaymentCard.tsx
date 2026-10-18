import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { toast } from 'sonner'
import { getPaymentSettings, updatePaymentSettings } from '@/api/payment'
import { getSiteSettings, setSiteSettings, type SiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

const DEFAULT_HOURS = 24
const DEFAULT_UNIQUE_MAX = 999

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Where buyers pay and how an order behaves: the account to transfer to, time to pay, the unique code, trials
export function HostingPaymentCard() {
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  if (!site.data) return null
  const s = site.data
  // keyed by the stored values so the form follows what the agent saved
  return <PaymentForm key={[s.selfSignup, s.orderBank, s.orderAccount, s.orderHolder, s.orderExpiryMinutes, s.orderUniqueMax, s.trialApproval].join('|')} settings={s} />
}

function PaymentForm({ settings }: { settings: SiteSettings }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  // a transfer that matches an order exactly activates the account at once only while this is on
  const gateway = useQuery({ queryKey: ['settings', 'payment'], queryFn: getPaymentSettings, retry: 0 })
  const autoConfirm = gateway.data?.settings.find((item) => item.key === 'auto_confirm')?.value === 'true'
  const autoConfirmMut = useMutation({
    mutationFn: (on: boolean) => updatePaymentSettings({ settings: { auto_confirm: on ? 'true' : 'false' } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'payment'] })
      toast.success(t('hosting.payment.autoSaved'))
    },
    onError: (e) => toast.error(apiError(e, t('settings.site.failed'))),
  })
  const [selfSignup, setSelfSignup] = useState(settings.selfSignup)
  const [bank, setBank] = useState(settings.orderBank)
  const [account, setAccount] = useState(settings.orderAccount)
  const [holder, setHolder] = useState(settings.orderHolder)
  const [hours, setHours] = useState(String(settings.orderExpiryMinutes > 0 ? settings.orderExpiryMinutes / 60 : DEFAULT_HOURS))
  const [uniqueMax, setUniqueMax] = useState(String(settings.orderUniqueMax > 0 ? settings.orderUniqueMax : DEFAULT_UNIQUE_MAX))
  const [trialApproval, setTrialApproval] = useState(settings.trialApproval)
  const [error, setError] = useState('')

  const hoursNumber = Number(hours)
  const uniqueNumber = Number(uniqueMax)
  const hoursValid = hours.trim() !== '' && hoursNumber >= 0.5 && hoursNumber <= 168
  const uniqueValid = uniqueMax.trim() !== '' && Number.isInteger(uniqueNumber) && uniqueNumber >= 9 && uniqueNumber <= 9999
  const minutes = Math.round(hoursNumber * 60)
  const dirty =
    selfSignup !== settings.selfSignup || bank.trim() !== settings.orderBank || account.trim() !== settings.orderAccount || holder.trim() !== settings.orderHolder ||
    minutes !== (settings.orderExpiryMinutes || DEFAULT_HOURS * 60) || uniqueNumber !== (settings.orderUniqueMax || DEFAULT_UNIQUE_MAX) || trialApproval !== settings.trialApproval
  const missingAccount = selfSignup && (account.trim() === '' || holder.trim() === '')

  const mutation = useMutation({
    mutationFn: () =>
      setSiteSettings({
        selfSignup, orderBank: bank.trim(), orderAccount: account.trim(), orderHolder: holder.trim(),
        orderExpiryMinutes: minutes, orderUniqueMax: uniqueNumber, trialApproval,
      }),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'site'], data)
      void qc.invalidateQueries({ queryKey: ['public-hosting'] })
      setError('')
      toast.success(t('hosting.payment.saved'))
    },
    onError: (e) => setError(apiError(e, t('settings.site.failed'))),
  })

  return (
    <div className="panel-shell-card flex flex-col gap-4 settings-card">
      <SectionHeader icon={<Landmark />} title={t('hosting.payment.title')} subtitle={t('hosting.payment.subtitle')} />

      <SettingRow
        title={t('hosting.payment.selfSignup')}
        description={t('hosting.payment.selfSignupHint')}
        control={<ToggleSwitch checked={selfSignup} label={t('hosting.payment.selfSignup')} onChange={() => setSelfSignup((on) => !on)} />}
      />

      <SettingRow
        title={t('hosting.payment.autoConfirm')}
        description={autoConfirm ? t('hosting.payment.autoConfirmOn') : t('hosting.payment.autoConfirmOff')}
        control={
          <ToggleSwitch
            checked={autoConfirm}
            disabled={!gateway.data || autoConfirmMut.isPending}
            label={t('hosting.payment.autoConfirm')}
            onChange={() => autoConfirmMut.mutate(!autoConfirm)}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('hosting.payment.bank')}>
          <TextInput value={bank} maxLength={80} onChange={(e) => setBank(e.target.value)} placeholder="BCA" />
        </Field>
        <Field label={t('hosting.payment.account')} error={missingAccount && account.trim() === '' ? t('hosting.payment.accountRequired') : undefined}>
          <TextInput mono value={account} maxLength={80} onChange={(e) => setAccount(e.target.value)} />
        </Field>
        <Field label={t('hosting.payment.holder')} error={missingAccount && holder.trim() === '' ? t('hosting.payment.accountRequired') : undefined}>
          <TextInput value={holder} maxLength={80} onChange={(e) => setHolder(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('hosting.payment.hours')} hint={t('hosting.payment.hoursHint')} error={hours !== '' && !hoursValid ? t('hosting.payment.hoursInvalid') : undefined}>
          <TextInput mono type="number" min={0.5} max={168} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label={t('hosting.payment.uniqueMax')} hint={t('hosting.payment.uniqueMaxHint')} error={uniqueMax !== '' && !uniqueValid ? t('hosting.payment.uniqueMaxInvalid') : undefined}>
          <TextInput mono type="number" min={9} max={9999} value={uniqueMax} onChange={(e) => setUniqueMax(e.target.value)} />
        </Field>
      </div>

      <Checkbox checked={trialApproval} onChange={setTrialApproval} label={t('hosting.payment.trialApproval')} description={t('hosting.payment.trialApprovalHint')} />

      {error ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{error}</p> : null}

      <div className="flex justify-end border-t border-[var(--win-border)] pt-3.5">
        <Button variant="primary" disabled={!dirty || !hoursValid || !uniqueValid || missingAccount} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
