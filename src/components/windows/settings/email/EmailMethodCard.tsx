import { Cloud, ExternalLink, Mail, Server } from 'lucide-react'
import type { EmailServerConfig, EmailServerMethod } from '@/api/email'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'
import { OptionCards } from '../OptionCards'

interface EmailMethodCardProps {
  form: EmailServerConfig
  onChange: <K extends keyof EmailServerConfig>(key: K, value: EmailServerConfig[K]) => void
  onOpenEmailWindow: () => void
}

export function EmailMethodCard({ form, onChange, onOpenEmailWindow }: EmailMethodCardProps) {
  const { t } = useI18n()

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <SectionHeader
        icon={<Mail />}
        title={t('email.settings.title')}
        subtitle={t('email.settings.subtitle')}
        tone="primary"
        className="mb-0"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={form.enabled ? 'success' : 'neutral'} dot>
              {form.enabled ? t('email.settings.statusActive') : t('email.settings.statusInactive')}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={onOpenEmailWindow}
            >
              {t('email.settings.openWindow')}
            </Button>
          </div>
        }
      />

      <SettingRow
        title={t('email.settings.enableLabel')}
        description={t('email.settings.enableDesc')}
        control={
          <ToggleSwitch
            checked={form.enabled}
            onChange={() => onChange('enabled', !form.enabled)}
            label={t('email.settings.enableLabel')}
          />
        }
      />

      <div className="pt-1">
        <p className="mb-2 text-[0.75rem] font-semibold text-[var(--win-text)]">
          {t('email.settings.methodLabel')}
        </p>
        <OptionCards<EmailServerMethod>
          label={t('email.settings.methodLabel')}
          value={form.method}
          onChange={(method) => onChange('method', method)}
          options={[
            {
              key: 'cloudflare',
              label: t('email.settings.methodCloudflare'),
              description: t('email.settings.methodCloudflareDesc'),
              icon: <Cloud />,
            },
            {
              key: 'ip',
              label: t('email.settings.methodIp'),
              description: t('email.settings.methodIpDesc'),
              icon: <Server />,
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
        <Field label={t('email.settings.domainLabel')} hint={t('email.settings.domainHint')}>
          <TextInput
            mono
            value={form.domain}
            onChange={(e) => onChange('domain', e.target.value)}
            placeholder={t('email.ph.domain')}
          />
        </Field>
        <Field label={t('email.settings.fromNameLabel')} hint={t('email.settings.fromNameHint')}>
          <TextInput
            value={form.fromName}
            onChange={(e) => onChange('fromName', e.target.value)}
            placeholder={t('email.ph.fromName')}
          />
        </Field>
        <Field label={t('email.settings.fromAddressLabel')} hint={t('email.settings.fromAddressHint')}>
          <TextInput
            mono
            value={form.fromAddress}
            onChange={(e) => onChange('fromAddress', e.target.value)}
            placeholder={form.domain ? `noreply@${form.domain}` : t('email.ph.fromAddress')}
          />
        </Field>
      </div>
    </div>
  )
}
