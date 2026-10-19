import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { createCloudTemplates, getCloudTemplates, saveCloudChannel, type NotifyChannel, type TemplateStatus } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  error: 'danger',
  unconfigured: 'neutral',
}
const TEMPLATE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  PAUSED: 'danger',
  MISSING: 'neutral',
}
const ORDER: TemplateStatus[] = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'MISSING']

// WhatsApp Cloud, the official API of Meta: its token and ids, and the templates Meta has to approve before the panel
// can start a message
export function CloudCard({ channel, webhook, bare }: { channel: NotifyChannel | undefined; webhook?: { verifyToken: string; secretSet: boolean } | null; bare?: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const configured = channel?.configured ?? false
  const [token, setToken] = useState('')
  const [phoneId, setPhoneId] = useState(channel?.phoneId ?? '')
  const [wabaId, setWabaId] = useState(channel?.wabaId ?? '')
  const [enabled, setEnabled] = useState(channel?.enabled ?? false)
  const [appSecret, setAppSecret] = useState('')
  const status = (channel?.status ?? 'unconfigured') as keyof typeof STATUS_TONE

  const dirty =
    token.trim() !== '' || appSecret.trim() !== '' || phoneId !== (channel?.phoneId ?? '') || wabaId !== (channel?.wabaId ?? '') || enabled !== (channel?.enabled ?? false)
  const save = useMutation({
    mutationFn: () => saveCloudChannel({ enabled, phoneId, wabaId, ...(token.trim() ? { accessToken: token.trim() } : {}), ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}) }),
    onSuccess: (overview) => {
      qc.setQueryData(['notify', 'overview'], overview)
      setToken('')
      setAppSecret('')
      void qc.invalidateQueries({ queryKey: ['notify', 'cloud-templates'] })
      toast.success(t('notify.cloud.saved'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.cloud.saveFailed'))),
  })

  const templates = useQuery({ queryKey: ['notify', 'cloud-templates'], queryFn: getCloudTemplates, enabled: configured, retry: 0 })
  const make = useMutation({
    mutationFn: createCloudTemplates,
    onSuccess: (data) => {
      toast.success(t('notify.cloud.templatesMade', { count: data.created }))
      void templates.refetch()
    },
    onError: (error) => toast.error(apiError(error, t('notify.cloud.templatesFailed'))),
  })
  const counts = ORDER.map((key) => [key, (templates.data ?? []).filter((x) => x.status === key).length] as const).filter(([, n]) => n > 0)
  const missing = (templates.data ?? []).filter((x) => x.status === 'MISSING').length

  return (
    <div className={bare ? 'flex flex-col gap-4' : 'panel-shell-card flex flex-col gap-4 settings-card'}>
      <SectionHeader
        icon={<ShieldCheck />}
        title={t('notify.cloud.title')}
        subtitle={t('notify.cloud.subtitle')}
        actions={
          <Badge tone={channel?.enabled ? STATUS_TONE[status] ?? 'neutral' : 'neutral'} dot>
            {channel?.enabled ? t(`notify.telegram.status.${status}`) : t('notify.telegram.off')}
          </Badge>
        }
      />

      {channel?.lastError && status === 'error' ? (
        <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">
          {channel.lastError}
        </p>
      ) : null}
      {configured && channel?.phone ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('notify.cloud.sendsFrom')} <span className="panel-mono font-semibold text-[var(--win-text)]">{channel.phone}</span>
          {channel.phoneName ? ` (${channel.phoneName})` : ''}
        </p>
      ) : null}

      <Field label={t('notify.cloud.token')} htmlFor="notify-cloud-token" hint={configured ? t('notify.telegram.tokenSaved') : t('notify.cloud.tokenHint')}>
        <TextInput
          id="notify-cloud-token"
          mono
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={configured ? '••••••••••••••••' : 'EAAB...'}
        />
      </Field>
      <div className="grid gap-3 @[480px]:grid-cols-2">
        <Field label={t('notify.cloud.phoneId')} htmlFor="notify-cloud-phone">
          <TextInput id="notify-cloud-phone" mono inputMode="numeric" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} />
        </Field>
        <Field label={t('notify.cloud.wabaId')} htmlFor="notify-cloud-waba">
          <TextInput id="notify-cloud-waba" mono inputMode="numeric" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
        </Field>
      </div>

      {configured ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-[var(--win-text)]">{t('notify.cloud.webhook')}</p>
            <Badge tone={webhook?.secretSet ? 'success' : 'warning'} size="sm">
              {webhook?.secretSet ? t('notify.cloud.webhookReady') : t('notify.cloud.webhookNeedsSecret')}
            </Badge>
          </div>
          <p className="text-[var(--text-secondary)]">{t('notify.cloud.webhookHint')}</p>
          {[
            [t('notify.cloud.webhookUrl'), `${window.location.origin}/api/v1/public/notify/whatsapp-cloud/webhook`],
            [t('notify.cloud.webhookToken'), webhook?.verifyToken ?? ''],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] py-1 pl-3 pr-1">
              <span className="min-w-0">
                <span className="block text-[11.5px] text-[var(--text-secondary)]">{label}</span>
                <span className="panel-mono block truncate font-semibold text-[var(--win-text)]">{value || '-'}</span>
              </span>
              <IconButton label={t('common.copy')} disabled={!value} onClick={() => void copyTextToClipboard(value).then(() => toast.success(t('common.copied')))}>
                <Copy className="h-4 w-4" />
              </IconButton>
            </div>
          ))}
        </div>
      ) : null}
      <Field label={t('notify.cloud.appSecret')} htmlFor="notify-cloud-secret" hint={t('notify.cloud.appSecretHint')}>
        <TextInput id="notify-cloud-secret" mono type="password" autoComplete="off" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={webhook?.secretSet ? '••••••••••••••••' : ''} />
      </Field>

      <SettingRow
        title={t('notify.cloud.enable')}
        description={t('notify.cloud.enableHint')}
        control={
          <ToggleSwitch
            checked={enabled}
            disabled={!configured && token.trim() === ''}
            label={t('notify.cloud.enable')}
            onChange={() => setEnabled((on) => !on)}
          />
        }
      />

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--win-border)] pt-3.5">
        <Button variant="primary" disabled={!dirty || phoneId.trim() === '' || wabaId.trim() === ''} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>

      {configured ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-[var(--win-text)]">{t('notify.cloud.templates')}</p>
            <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={templates.isFetching && !make.isPending} onClick={() => void templates.refetch()}>
              {t('common.refresh')}
            </Button>
          </div>
          {templates.isError ? (
            <p role="alert" className="text-[var(--panel-danger-text)]">{apiError(templates.error, t('notify.cloud.templatesLoadFailed'))}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {counts.map(([key, n]) => (
                <Badge key={key} tone={TEMPLATE_TONE[key] ?? 'neutral'} size="sm">
                  {t(`notify.cloud.tpl.${key}`)} {n}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-[var(--text-secondary)]">{t('notify.cloud.templatesHint')}</p>
          {missing > 0 ? (
            <div>
              <Button variant="primary-soft" size="sm" loading={make.isPending} onClick={() => make.mutate()}>
                {t('notify.cloud.makeTemplates', { count: missing })}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="text-[12px] text-[var(--text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--win-text)]">{t('notify.cloud.guideTitle')}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>{t('notify.cloud.guide1')}</li>
          <li>{t('notify.cloud.guide2')}</li>
          <li>{t('notify.cloud.guide3')}</li>
          <li>{t('notify.cloud.guide4')}</li>
        </ol>
      </details>
    </div>
  )
}
