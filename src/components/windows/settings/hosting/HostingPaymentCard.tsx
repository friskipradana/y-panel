import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { toast } from 'sonner'
import { getPaymentSettings, updatePaymentSettings } from '@/api/payment'
import { getSiteSettings, setSiteSettings, type OrderMethod, type SiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'
import { blankMethod, methodReady, PaymentMethodsEditor } from './PaymentMethodsEditor'

const DEFAULT_HOURS = 24
const DEFAULT_UNIQUE_MAX = 999

// The list as saved; settings from before the list had one account, which shows as a bank to edit
const savedMethods = (settings: SiteSettings): OrderMethod[] => {
  if ((settings.orderMethods ?? []).length > 0) return settings.orderMethods as OrderMethod[]
  if (settings.orderAccount && settings.orderHolder) return [{ ...blankMethod(), name: settings.orderBank ?? '', account: settings.orderAccount, holder: settings.orderHolder }]
  return []
}

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Where buyers pay and how an order behaves: the account to transfer to, time to pay, the unique code, trials
export function HostingPaymentCard() {
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  if (!site.data) return null
  const s = site.data
  // keyed by the stored values so the form follows what the agent saved
  return <PaymentForm key={[s.selfSignup, JSON.stringify(s.orderMethods ?? []), s.orderAccount, s.orderExpiryMinutes, s.orderUniqueMax, s.trialApproval].join('|')} settings={s} />
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
  const [selfSignup, setSelfSignup] = useState(settings.selfSignup ?? false)
  const saved = savedMethods(settings)
  const [methods, setMethods] = useState<OrderMethod[]>(saved)
  const [hours, setHours] = useState(String((settings.orderExpiryMinutes ?? 0) > 0 ? (settings.orderExpiryMinutes ?? 0) / 60 : DEFAULT_HOURS))
  const [uniqueMax, setUniqueMax] = useState(String((settings.orderUniqueMax ?? 0) > 0 ? settings.orderUniqueMax : DEFAULT_UNIQUE_MAX))
  const [trialApproval, setTrialApproval] = useState(settings.trialApproval ?? false)
  const [error, setError] = useState('')

  const safeHours = hours ?? ''
  const safeUniqueMax = uniqueMax ?? ''

  const hoursNumber = Number(safeHours)
  const uniqueNumber = Number(safeUniqueMax)
  const hoursValid = safeHours.trim() !== '' && hoursNumber >= 0.5 && hoursNumber <= 168
  const uniqueValid = safeUniqueMax.trim() !== '' && Number.isInteger(uniqueNumber) && uniqueNumber >= 9 && uniqueNumber <= 9999
  const minutes = Math.round(hoursNumber * 60)
  const dirty =
    selfSignup !== settings.selfSignup ||
    JSON.stringify(methods) !== JSON.stringify(saved) ||
    minutes !== (settings.orderExpiryMinutes || DEFAULT_HOURS * 60) ||
    uniqueNumber !== (settings.orderUniqueMax || DEFAULT_UNIQUE_MAX) ||
    trialApproval !== settings.trialApproval
  const incomplete = methods.some((method) => !methodReady(method))
  const noneShown = selfSignup && !methods.some((method) => method.enabled && methodReady(method))

  const mutation = useMutation({
    mutationFn: () =>
      setSiteSettings({
        selfSignup,
        orderMethods: methods.map((method) => ({ ...method, name: method.name.trim(), account: method.account.trim(), holder: method.holder.trim() })),
        orderExpiryMinutes: minutes,
        orderUniqueMax: uniqueNumber,
        trialApproval,
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
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Landmark className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.payment.title')}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.payment.subtitle')}</p>
          </div>
        </div>
      </div>

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

      <PaymentMethodsEditor methods={methods} onChange={setMethods} />
      {incomplete ? <p className="text-[11.5px] text-[var(--panel-warning-text)]">{t('hosting.payment.methodIncomplete')}</p> : null}
      {noneShown && !incomplete ? <p className="text-[11.5px] text-[var(--panel-warning-text)]">{t('hosting.payment.accountRequired')}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('hosting.payment.hours')} hint={t('hosting.payment.hoursHint')} error={safeHours !== '' && !hoursValid ? t('hosting.payment.hoursInvalid') : undefined}>
          <TextInput mono type="number" min={0.5} max={168} step={0.5} value={safeHours} onChange={(e) => setHours(e.target.value)} className="!h-8 text-[12px]" />
        </Field>
        <Field label={t('hosting.payment.uniqueMax')} hint={t('hosting.payment.uniqueMaxHint')} error={safeUniqueMax !== '' && !uniqueValid ? t('hosting.payment.uniqueMaxInvalid') : undefined}>
          <TextInput mono type="number" min={9} max={9999} value={safeUniqueMax} onChange={(e) => setUniqueMax(e.target.value)} className="!h-8 text-[12px]" />
        </Field>
      </div>

      <Checkbox checked={trialApproval} onChange={setTrialApproval} label={t('hosting.payment.trialApproval')} description={t('hosting.payment.trialApprovalHint')} />

      {error ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{error}</p> : null}

      <div className="flex justify-end border-t border-[var(--win-border)] pt-3.5">
        <Button variant="primary" size="sm" disabled={!dirty || !hoursValid || !uniqueValid || incomplete || noneShown} loading={mutation.isPending} onClick={() => mutation.mutate()} className="!h-8">
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
