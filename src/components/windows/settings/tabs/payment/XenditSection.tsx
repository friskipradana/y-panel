import type { Dispatch, SetStateAction } from 'react'
import { Eye, EyeOff, Globe2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput } from '@/components/ui/Field'
import { FieldLabel } from '../../SettingsPrimitives'

interface Props {
  settings: Record<string, string>
  set: (key: string, value: string) => void
  showSecrets: Record<string, boolean>
  setShowSecrets: Dispatch<SetStateAction<Record<string, boolean>>>
}

// Xendit credentials, with the state of the configuration
export function XenditSection({ settings, set, showSecrets, setShowSecrets }: Props) {
  const { t } = useI18n()
  const xenditSecretKey = settings['xendit_secret_key'] ?? ''
  const xenditCallbackToken = settings['xendit_callback_token'] ?? ''
  const xenditComplete = xenditSecretKey.trim() !== '' && xenditCallbackToken.trim() !== ''

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[var(--win-text)]">Xendit</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge size="sm" tone={xenditComplete ? 'success' : 'warning'} dot>
            {xenditComplete ? t('settings.payment.complete') : t('settings.payment.incomplete')}
          </Badge>
        </div>
      </div>
      <p className="text-[11px] text-[var(--text-secondary)] mb-3 leading-relaxed">
        {t('settings.payment.xenditSubtitle')}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <FieldLabel label={`Xendit ${t('settings.payment.secretKey')}`} />
          <div className="relative">
            <TextInput
              id="payment-xendit_secret_key"
              mono
              type={showSecrets['xendit_secret_key'] ? 'text' : 'password'}
              autoComplete="off"
              value={xenditSecretKey}
              className="!h-8 px-2.5 pr-9 text-[12px]"
              placeholder="••••••••••••"
              onChange={(e) => set('xendit_secret_key', e.target.value)}
            />
            <IconButton
              type="button"
              className="absolute right-1 top-1/2 !h-6 !w-6 -translate-y-1/2"
              label={showSecrets['xendit_secret_key'] ? t('settings.hideKey') : t('settings.showKey')}
              onClick={() => setShowSecrets((prev) => ({ ...prev, xendit_secret_key: !prev['xendit_secret_key'] }))}
            >
              {showSecrets['xendit_secret_key'] ? <EyeOff size={13} /> : <Eye size={13} />}
            </IconButton>
          </div>
        </div>

        <div>
          <FieldLabel label={`Xendit ${t('settings.payment.callbackToken')}`} />
          <div className="relative">
            <TextInput
              id="payment-xendit_callback_token"
              mono
              type={showSecrets['xendit_callback_token'] ? 'text' : 'password'}
              autoComplete="off"
              value={xenditCallbackToken}
              className="!h-8 px-2.5 pr-9 text-[12px]"
              placeholder="••••••••••••"
              onChange={(e) => set('xendit_callback_token', e.target.value)}
            />
            <IconButton
              type="button"
              className="absolute right-1 top-1/2 !h-6 !w-6 -translate-y-1/2"
              label={showSecrets['xendit_callback_token'] ? t('settings.hideKey') : t('settings.showKey')}
              onClick={() => setShowSecrets((prev) => ({ ...prev, xendit_callback_token: !prev['xendit_callback_token'] }))}
            >
              {showSecrets['xendit_callback_token'] ? <EyeOff size={13} /> : <Eye size={13} />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}
