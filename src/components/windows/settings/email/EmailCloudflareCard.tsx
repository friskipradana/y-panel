import { Cloud, KeyRound } from 'lucide-react'
import type { EmailCloudflareZone, EmailServerConfig, EmailTLSMode } from '@/api/email'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Select } from '@/components/ui/Select'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { OptionCards } from '../OptionCards'

interface EmailCloudflareCardProps {
  form: EmailServerConfig
  smtpPassword: string
  onSmtpPasswordChange: (value: string) => void
  cloudflareReady: boolean
  zones: EmailCloudflareZone[]
  onChange: <K extends keyof EmailServerConfig>(key: K, value: EmailServerConfig[K]) => void
}

export function EmailCloudflareCard({
  form,
  smtpPassword,
  onSmtpPasswordChange,
  cloudflareReady,
  zones,
  onChange,
}: EmailCloudflareCardProps) {
  const { t } = useI18n()

  const zoneOptions = zones.map((zone) => ({
    value: zone.id,
    label: zone.name,
    description: zone.id,
  }))

  const handleSelectZone = (zoneId: string) => {
    onChange('cfZoneId', zoneId)
    const matched = zones.find((z) => z.id === zoneId)
    if (matched && (!form.domain || form.domain !== matched.name)) {
      onChange('domain', matched.name)
    }
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <SectionHeader
        icon={<Cloud />}
        title={t('email.settings.cfTitle')}
        subtitle={t('email.settings.cfSubtitle')}
        tone="primary"
        className="mb-0"
        actions={
          <Badge tone={cloudflareReady ? 'success' : 'warning'} dot>
            {cloudflareReady ? t('email.settings.cfTokenReady') : t('email.settings.cfTokenMissing')}
          </Badge>
        }
      />

      {!cloudflareReady && (
        <div className="panel-muted-block flex flex-wrap items-center justify-between gap-2.5 px-3 py-2.5">
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {t('email.settings.cfTokenHint')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<KeyRound className="h-3.5 w-3.5" />}
            onClick={() => useSettingsNavStore.getState().request('cloudflare')}
          >
            {t('tunnels.openCloudflareSettings')}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('email.settings.cfZoneLabel')} hint={t('email.settings.cfZoneHint')}>
          {zoneOptions.length > 0 ? (
            <Select
              value={form.cfZoneId}
              onChange={handleSelectZone}
              options={zoneOptions}
              placeholder={t('email.settings.cfZonePlaceholder')}
              clearable
            />
          ) : (
            <TextInput
              mono
              value={form.cfZoneId}
              onChange={(e) => onChange('cfZoneId', e.target.value)}
              placeholder={t('email.ph.cfZoneId')}
            />
          )}
        </Field>

        <Field label={t('email.settings.cfForwardToLabel')} hint={t('email.settings.cfForwardToHint')}>
          <TextInput
            mono
            value={form.cfForwardTo}
            onChange={(e) => onChange('cfForwardTo', e.target.value)}
            placeholder={t('email.ph.forwardTo')}
          />
        </Field>
      </div>

      <SettingRow
        title={t('email.settings.cfCatchAllLabel')}
        description={t('email.settings.cfCatchAllDesc')}
        control={
          <ToggleSwitch
            checked={form.cfCatchAll}
            onChange={() => onChange('cfCatchAll', !form.cfCatchAll)}
            label={t('email.settings.cfCatchAllLabel')}
          />
        }
      />

      <div className="pt-1">
        <p className="mb-2 text-[0.75rem] font-semibold text-[var(--win-text)]">
          {t('email.settings.cfOutboundLabel')}
        </p>
        <OptionCards<'smtp' | 'worker'>
          label={t('email.settings.cfOutboundLabel')}
          value={form.cfOutboundRelay}
          onChange={(val) => onChange('cfOutboundRelay', val)}
          options={[
            {
              key: 'smtp',
              label: t('email.settings.cfOutboundSmtp'),
              description: t('email.settings.cfOutboundSmtpDesc'),
            },
            {
              key: 'worker',
              label: t('email.settings.cfOutboundWorker'),
              description: t('email.settings.cfOutboundWorkerDesc'),
            },
          ]}
        />
      </div>

      {form.cfOutboundRelay === 'smtp' && (
        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
          <Field label={t('email.settings.smtpHostLabel')}>
            <TextInput
              mono
              value={form.smtpHost}
              onChange={(e) => onChange('smtpHost', e.target.value)}
              placeholder={t('email.ph.smtpHost')}
            />
          </Field>
          <Field label={t('email.settings.submissionPortLabel')}>
            <TextInput
              mono
              type="number"
              value={String(form.submissionPort)}
              onChange={(e) => onChange('submissionPort', Number(e.target.value) || 587)}
              placeholder="587"
            />
          </Field>
          <Field label={t('email.settings.tlsModeLabel')}>
            <Select
              value={form.tlsMode}
              onChange={(val) => onChange('tlsMode', val as EmailTLSMode)}
              options={[
                { value: 'starttls', label: 'STARTTLS (587)' },
                { value: 'tls', label: 'Implicit TLS (465)' },
                { value: 'none', label: t('email.settings.tlsNone') },
              ]}
            />
          </Field>
          <Field label={t('email.settings.smtpUserLabel')}>
            <TextInput
              mono
              value={form.smtpUser}
              onChange={(e) => onChange('smtpUser', e.target.value)}
              placeholder={t('email.ph.smtpUser')}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label={t('email.settings.smtpPassLabel')}
              hint={form.smtpPasswordSet ? t('email.settings.smtpPassSavedHint') : undefined}
            >
              <PasswordInput
                mono
                value={smtpPassword}
                onChange={(e) => onSmtpPasswordChange(e.target.value)}
                placeholder={form.smtpPasswordSet ? '••••••••••••' : t('email.settings.smtpPassPlaceholder')}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}
