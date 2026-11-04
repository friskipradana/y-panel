import { Compass, Server, ShieldCheck } from 'lucide-react'
import type { EmailFirewallStatus, EmailServerConfig, EmailTLSMode } from '@/api/email'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'

interface EmailIpServerCardProps {
  form: EmailServerConfig
  smtpPassword: string
  onSmtpPasswordChange: (value: string) => void
  firewall: EmailFirewallStatus
  detectingIp: boolean
  openingPorts: boolean
  onDetectPublicIp: () => void
  onOpenFirewallPorts: () => void
  onChange: <K extends keyof EmailServerConfig>(key: K, value: EmailServerConfig[K]) => void
}

export function EmailIpServerCard({
  form,
  smtpPassword,
  onSmtpPasswordChange,
  firewall,
  detectingIp,
  openingPorts,
  onDetectPublicIp,
  onOpenFirewallPorts,
  onChange,
}: EmailIpServerCardProps) {
  const { t } = useI18n()

  const closedPorts = firewall.ports.filter((p) => !p.open).map((p) => p.port)
  const allOpen = firewall.ports.length > 0 && closedPorts.length === 0

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <SectionHeader
        icon={<Server />}
        title={t('email.settings.ipTitle')}
        subtitle={t('email.settings.ipSubtitle')}
        tone="primary"
        className="mb-0"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('email.settings.mailHostnameLabel')} hint={t('email.settings.mailHostnameHint')}>
          <TextInput
            mono
            value={form.mailHostname}
            onChange={(e) => onChange('mailHostname', e.target.value)}
            placeholder={form.domain ? `mail.${form.domain}` : 'mail.domainanda.com'}
          />
        </Field>

        <Field label={t('email.settings.publicIpLabel')} hint={t('email.settings.publicIpHint')}>
          <div className="flex items-center gap-2">
            <TextInput
              mono
              value={form.publicIp}
              onChange={(e) => onChange('publicIp', e.target.value)}
              placeholder="203.0.113.10"
            />
            <Button
              type="button"
              variant="outline"
              size="md"
              loading={detectingIp}
              icon={<Compass className="h-3.5 w-3.5" />}
              onClick={onDetectPublicIp}
            >
              {t('email.settings.detectIp')}
            </Button>
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="col-span-2">
          <Field label={t('email.settings.smtpHostLabel')}>
            <TextInput
              mono
              value={form.smtpHost}
              onChange={(e) => onChange('smtpHost', e.target.value)}
              placeholder="127.0.0.1"
            />
          </Field>
        </div>
        <Field label={t('email.settings.smtpPortLabel')}>
          <TextInput
            mono
            type="number"
            value={String(form.smtpPort)}
            onChange={(e) => onChange('smtpPort', Number(e.target.value) || 25)}
            placeholder="25"
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
        <Field label={t('email.settings.smtpsPortLabel')}>
          <TextInput
            mono
            type="number"
            value={String(form.smtpsPort)}
            onChange={(e) => onChange('smtpsPort', Number(e.target.value) || 465)}
            placeholder="465"
          />
        </Field>
        <Field label={t('email.settings.imapPortLabel')}>
          <TextInput
            mono
            type="number"
            value={String(form.imapPort)}
            onChange={(e) => onChange('imapPort', Number(e.target.value) || 993)}
            placeholder="993"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t('email.settings.tlsModeLabel')}>
          <Select
            value={form.tlsMode}
            onChange={(val) => onChange('tlsMode', val as EmailTLSMode)}
            options={[
              { value: 'starttls', label: 'STARTTLS (Port 587/25)' },
              { value: 'tls', label: 'Implicit TLS / SSL (Port 465)' },
              { value: 'none', label: t('email.settings.tlsNone') },
            ]}
          />
        </Field>
        <Field label={t('email.settings.smtpUserLabel')}>
          <TextInput
            mono
            value={form.smtpUser}
            onChange={(e) => onChange('smtpUser', e.target.value)}
            placeholder={form.domain ? `postmaster@${form.domain}` : t('email.ph.smtpUser')}
          />
        </Field>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t('email.settings.dkimSelectorLabel')} hint={t('email.settings.dkimSelectorHint')}>
          <TextInput
            mono
            value={form.dkimSelector}
            onChange={(e) => onChange('dkimSelector', e.target.value)}
            placeholder={t('email.ph.dkimSelector')}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('email.settings.dkimKeyLabel')} hint={t('email.settings.dkimKeyHint')}>
            <TextInput
              mono
              value={form.dkimPublicKey}
              onChange={(e) => onChange('dkimPublicKey', e.target.value)}
              placeholder={t('email.ph.dkimKey')}
            />
          </Field>
        </div>
      </div>

      {firewall.installed && firewall.active && (
        <div className="panel-muted-block flex flex-wrap items-center justify-between gap-2.5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--panel-primary-text)]" />
            <span className="text-[0.75rem] font-medium text-[var(--win-text)]">
              {t('email.settings.firewallLabel')}:
            </span>
            {firewall.ports.map((item) => (
              <Badge key={item.port} tone={item.open ? 'success' : 'warning'} className="panel-mono" dot>
                {item.port}
              </Badge>
            ))}
          </div>
          {!allOpen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={openingPorts}
              onClick={onOpenFirewallPorts}
            >
              {t('email.settings.openFirewallPorts')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
