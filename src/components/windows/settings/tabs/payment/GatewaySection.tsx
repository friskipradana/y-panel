import { useState } from 'react'
import { Check, Copy, CreditCard, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import type { PaymentSettings } from '../../hooks/usePaymentSettings'
import { SettingsSaveBar } from '../../SettingsSaveBar'
import { FieldLabel } from '../../SettingsPrimitives'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { TextInput } from '@/components/ui/Field'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { MidtransSection } from './MidtransSection'
import { XenditSection } from './XenditSection'

// Payment gateways: one card with the active gateway selector, the credentials and the webhook config
export function GatewaySection({ payment }: { payment: PaymentSettings }) {
  const { t } = useI18n()
  const {
    paymentSettings,
    setPaymentSettings,
    changedKeys,
    showSecrets,
    setShowSecrets,
    paymentQuery,
    paymentSettingsList,
    paymentMutation,
    testGatewayMutation,
    handleSavePaymentSettings,
  } = payment

  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const dirty = changedKeys.length > 0
  const set = (key: string, value: string) => setPaymentSettings((prev) => ({ ...prev, [key]: value }))

  // Standard keys
  const activeGateway = paymentSettings['active_gateway'] ?? ''
  const currency = paymentSettings['currency'] ?? 'IDR'
  const webhookUrl = paymentSettings['webhook_url'] ?? ''
  const autoConfirm = paymentSettings['auto_confirm'] === 'true'
  const tolerance = paymentSettings['notification_tolerance_sec'] ?? '300'

  // Extra dynamic keys (if backend returns custom additions)
  const standardKeys = new Set([
    'active_gateway',
    'midtrans_server_key',
    'midtrans_client_key',
    'midtrans_environment',
    'xendit_secret_key',
    'xendit_callback_token',
    'currency',
    'webhook_url',
    'auto_confirm',
    'notification_tolerance_sec',
  ])
  const extraItems = paymentSettingsList.filter((s) => !standardKeys.has(s.key))

  const defaultWebhook = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/payment/webhook` : ''
  const effectiveWebhook = webhookUrl || defaultWebhook

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(effectiveWebhook)
      setCopiedWebhook(true)
      toast.success(t('common.copied'))
      setTimeout(() => setCopiedWebhook(false), 2000)
    } catch {
      toast.error(t('settings.listener.copyUrlFailed'))
    }
  }

  if (paymentQuery.isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] my-auto">
        <LoadingState>{t('settings.loadingPaymentGateway')}</LoadingState>
      </div>
    )
  }

  if (paymentQuery.isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] my-auto">
        <ErrorState
          className="max-w-sm w-full"
          title={t('settings.payment.loadFailed')}
          hint={t('settings.payment.loadFailedHint')}
          action={
            <Button variant="primary" size="sm" loading={paymentQuery.isFetching} onClick={() => void paymentQuery.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    )
  }

  if (paymentSettingsList.length === 0) {
    return (
      <div className="panel-empty min-h-[80px] text-[12px]">
        <span>{t('settings.noPaymentGatewayConfig')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Single Unified Payment Settings Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section 1: Gateway Utama & Transaksi ── */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 mobile:flex-col mobile:items-start mobile:gap-1.5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('settings.payment.mainGateway')}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {activeGateway === 'midtrans' ? (
                <Badge size="sm" tone="warning" dot>
                  Midtrans
                </Badge>
              ) : activeGateway === 'xendit' ? (
                <Badge size="sm" tone="primary" dot>
                  Xendit
                </Badge>
              ) : (
                <Badge size="sm" tone="neutral">
                  {t('settings.payment.gatewayNone')}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mb-3 leading-relaxed">{t('settings.payment.mainGatewaySubtitle')}</p>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <FieldLabel label={t('settings.payment.activeGateway')} />
                <Select
                  id="payment-active-gateway"
                  value={activeGateway}
                  onChange={(v) => set('active_gateway', v)}
                  buttonClassName="!h-8 text-[12px] px-2.5"
                  options={[
                    { value: '', label: t('settings.payment.gatewayNone'), description: t('settings.payment.gatewayNoneDesc') },
                    { value: 'midtrans', label: t('settings.payment.gatewayMidtrans'), description: t('settings.payment.gatewayMidtransDesc') },
                    { value: 'xendit', label: t('settings.payment.gatewayXendit'), description: t('settings.payment.gatewayXenditDesc') },
                  ]}
                />
              </div>

              <div>
                <FieldLabel label={t('settings.payment.currency')} />
                <TextInput
                  id="payment-currency"
                  value={currency}
                  onChange={(e) => set('currency', e.target.value.toUpperCase())}
                  mono
                  placeholder="IDR"
                  className="!h-8 px-2.5 text-[12px]"
                />
              </div>
            </div>

            <div>
              <FieldLabel label={t('settings.payment.webhookUrl')} />
              <div className="flex items-center gap-2">
                <TextInput
                  id="payment-webhook-url"
                  value={webhookUrl}
                  onChange={(e) => set('webhook_url', e.target.value)}
                  mono
                  placeholder={defaultWebhook}
                  className="!h-8 px-2.5 text-[12px] flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  icon={copiedWebhook ? <Check className="h-3.5 w-3.5 text-[var(--panel-success-text)]" /> : <Copy className="h-3.5 w-3.5" />}
                  onClick={handleCopyWebhook}
                  className="!h-8 shrink-0 text-[11.5px]"
                >
                  {copiedWebhook ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{t('settings.payment.webhookUrlHint')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 items-stretch gap-3 pt-1">
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] min-h-[58px] gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--win-text)]">{t('settings.payment.autoConfirm')}</div>
                  <div className="text-[10.5px] text-[var(--text-secondary)] leading-tight mt-0.5">{t('settings.payment.autoConfirmDesc')}</div>
                </div>
                <ToggleSwitch
                  checked={autoConfirm}
                  onChange={() => set('auto_confirm', autoConfirm ? 'false' : 'true')}
                  label={t('settings.payment.autoConfirm')}
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] min-h-[58px] gap-3 mobile:flex-col mobile:items-start">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--win-text)]">{t('settings.payment.tolerance')}</div>
                  <div className="text-[10.5px] text-[var(--text-secondary)] leading-tight mt-0.5">{t('settings.payment.toleranceDesc')}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TextInput
                    id="payment-tolerance"
                    type="number"
                    min="10"
                    max="86400"
                    value={tolerance}
                    onChange={(e) => set('notification_tolerance_sec', e.target.value)}
                    mono
                    className="!h-7 w-20 text-center px-1.5 text-[12px]"
                    placeholder="300"
                  />
                  <span className="text-[11px] text-[var(--text-secondary)] font-sans">{t('settings.payment.secondsShort')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        <MidtransSection settings={paymentSettings} set={set} showSecrets={showSecrets} setShowSecrets={setShowSecrets} />

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        <XenditSection settings={paymentSettings} set={set} showSecrets={showSecrets} setShowSecrets={setShowSecrets} />

        {/* Extra dynamic keys if any */}
        {extraItems.length > 0 ? (
          <>
            <div className="border-t border-[var(--win-border)]" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
                <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('settings.payment.others')}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {extraItems.map((item) => (
                  <div key={item.key}>
                    <FieldLabel label={item.label} hint={item.key} />
                    <TextInput
                      id={`payment-${item.key}`}
                      mono
                      value={paymentSettings[item.key] ?? ''}
                      onChange={(e) => set(item.key, e.target.value)}
                      className="!h-8 px-2.5 text-[12px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <SettingsSaveBar
        id="payment-save-settings"
        title={t('settings.saveGatewayConfig')}
        hint={dirty ? t('settings.payment.unsaved', { count: changedKeys.length }) : t('settings.saveGatewayConfigHint')}
        dirty={dirty}
        pending={paymentMutation.isPending}
        onSave={handleSavePaymentSettings}
        saveLabel={t('common.save')}
        pendingLabel={t('settings.saving')}
        extra={
          <Button
            id="payment-test-gateway"
            type="button"
            variant="ghost"
            icon={<Wifi className="h-3.5 w-3.5" />}
            loading={testGatewayMutation.isPending}
            disabled={dirty}
            title={dirty ? t('settings.payment.saveBeforeTest') : undefined}
            onClick={() => testGatewayMutation.mutate()}
          >
            {testGatewayMutation.isPending ? t('settings.testing') : t('settings.testConnection')}
          </Button>
        }
      />
    </div>
  )
}
