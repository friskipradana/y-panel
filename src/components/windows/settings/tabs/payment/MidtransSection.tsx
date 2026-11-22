import type { Dispatch, SetStateAction } from 'react'
import { Eye, EyeOff, Zap } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { TextInput } from '@/components/ui/Field'
import { FieldLabel } from '../../SettingsPrimitives'

interface Props {
  settings: Record<string, string>
  set: (key: string, value: string) => void
  showSecrets: Record<string, boolean>
  setShowSecrets: Dispatch<SetStateAction<Record<string, boolean>>>
}

// Midtrans credentials, with the state of the configuration
export function MidtransSection({ settings, set, showSecrets, setShowSecrets }: Props) {
  const { t } = useI18n()
  const midtransServerKey = settings['midtrans_server_key'] ?? ''
  const midtransClientKey = settings['midtrans_client_key'] ?? ''
  const midtransEnv = settings['midtrans_environment'] || 'sandbox'
  const midtransComplete = midtransServerKey.trim() !== '' && midtransClientKey.trim() !== ''
  const midtransLive = midtransEnv === 'production'

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--panel-warning-text)]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[var(--win-text)]">Midtrans</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge size="sm" tone={midtransLive ? 'danger' : 'neutral'}>
            {midtransLive ? t('settings.payment.production') : t('settings.payment.sandbox')}
          </Badge>
          <Badge size="sm" tone={midtransComplete ? 'success' : 'warning'} dot>
            {midtransComplete ? t('settings.payment.complete') : t('settings.payment.incomplete')}
          </Badge>
        </div>
      </div>
      <p className="text-[11px] text-[var(--text-secondary)] mb-3 leading-relaxed">{t('settings.payment.midtransSubtitle')}</p>

      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <FieldLabel label={t('settings.payment.environment')} />
            <Select
              id="payment-midtrans-environment"
              value={midtransEnv}
              onChange={(next) => set('midtrans_environment', next)}
              buttonClassName="!h-8 text-[12px] px-2.5"
              options={[
                { value: 'sandbox', label: t('settings.payment.sandbox'), description: t('settings.payment.sandboxHint') },
                { value: 'production', label: t('settings.payment.production'), description: t('settings.payment.productionHint') },
              ]}
            />
          </div>

          <div>
            <FieldLabel label={`Midtrans ${t('settings.payment.clientKey')}`} />
            <TextInput
              id="payment-midtrans_client_key"
              mono
              type="text"
              autoComplete="off"
              value={midtransClientKey}
              className="!h-8 px-2.5 text-[12px]"
              placeholder={t('settings.payment.midtransClientKeyPlaceholder')}
              onChange={(e) => set('midtrans_client_key', e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <FieldLabel label={`Midtrans ${t('settings.payment.serverKey')}`} />
            <div className="relative">
              <TextInput
                id="payment-midtrans_server_key"
                mono
                type={showSecrets['midtrans_server_key'] ? 'text' : 'password'}
                autoComplete="off"
                value={midtransServerKey}
                className="!h-8 px-2.5 pr-9 text-[12px]"
                placeholder="••••••••••••"
                onChange={(e) => set('midtrans_server_key', e.target.value)}
              />
              <IconButton
                type="button"
                className="absolute right-1 top-1/2 !h-6 !w-6 -translate-y-1/2"
                label={showSecrets['midtrans_server_key'] ? t('settings.hideKey') : t('settings.showKey')}
                onClick={() => setShowSecrets((prev) => ({ ...prev, midtrans_server_key: !prev['midtrans_server_key'] }))}
              >
                {showSecrets['midtrans_server_key'] ? <EyeOff size={13} /> : <Eye size={13} />}
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
