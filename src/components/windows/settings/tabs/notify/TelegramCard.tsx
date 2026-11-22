import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { saveTelegramChannel, testTelegram, type NotifyChannel, type NotifyRecipient } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const STATUS_TONE = { active: 'success', error: 'danger', unconfigured: 'neutral' } as const

// The Telegram bot that carries the notices: its token, the switch, and a test message through the same queue
export function TelegramCard({ channel, recipient, bare }: { channel: NotifyChannel | undefined; recipient: NotifyRecipient | undefined; bare?: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [token, setToken] = useState('')
  const [enabled, setEnabled] = useState(channel?.enabled ?? false)
  const configured = channel?.configured ?? false
  const status = (channel?.status ?? 'unconfigured') as keyof typeof STATUS_TONE

  const dirty = token.trim() !== '' || enabled !== (channel?.enabled ?? false)
  const save = useMutation({
    mutationFn: () => saveTelegramChannel({ enabled, ...(token.trim() ? { botToken: token.trim() } : {}) }),
    onSuccess: (overview) => {
      qc.setQueryData(['notify', 'overview'], overview)
      setToken('')
      toast.success(t('notify.telegram.saved'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.telegram.saveFailed'))),
  })
  const test = useMutation({
    mutationFn: testTelegram,
    onSuccess: () => {
      toast.success(t('notify.telegram.testQueued'))
      void qc.invalidateQueries({ queryKey: ['notify', 'outbox'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.telegram.testFailed'))),
  })

  const canTest = configured && (channel?.enabled ?? false) && !dirty && !!recipient?.linked && !recipient.blocked

  return (
    <div className={bare ? 'flex flex-col gap-3' : 'panel-shell-card flex flex-col gap-4 settings-card'}>
      <SectionHeader
        icon={<Send />}
        title={t('notify.telegram.title')}
        subtitle={t('notify.telegram.subtitle')}
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

      <Field
        label={t('notify.telegram.token')}
        htmlFor="notify-telegram-token"
        hint={configured ? t('notify.telegram.tokenSaved', { bot: channel?.botUsername ?? '-' }) : t('notify.telegram.tokenHint')}
      >
        <TextInput
          id="notify-telegram-token"
          mono
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={configured ? '••••••••••••••••' : '123456789:AA...'}
        />
      </Field>

      <SettingRow
        title={t('notify.telegram.enable')}
        description={t('notify.telegram.enableHint')}
        control={
          <ToggleSwitch
            checked={enabled}
            disabled={!configured && token.trim() === ''}
            label={t('notify.telegram.enable')}
            onChange={() => setEnabled((on) => !on)}
          />
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)] pt-3.5">
        <Button variant="outline" disabled={!canTest} loading={test.isPending} onClick={() => test.mutate()} title={canTest ? undefined : t('notify.telegram.testNeeds')}>
          {t('notify.telegram.test')}
        </Button>
        <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>

      <details className="text-[12px] text-[var(--text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--win-text)]">{t('notify.telegram.guideTitle')}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>{t('notify.telegram.guide1')}</li>
          <li>{t('notify.telegram.guide2')}</li>
          <li>{t('notify.telegram.guide3')}</li>
        </ol>
      </details>
    </div>
  )
}
