import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getOwnBot, removeOwnBot, saveOwnBot } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The own Telegram bot of this account, for the plans that include it: the token is kept encrypted, and the notices of the
// account leave from this bot. Shown only to an account whose plan includes it, or that still has one saved.
export function OwnBotCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [token, setToken] = useState('')
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const query = useQuery({ queryKey: ['notify', 'own-bot'], queryFn: getOwnBot, retry: 0 })
  const state = query.data

  const refreshChannel = () => void qc.invalidateQueries({ queryKey: ['notify', 'overview'] })
  const save = useMutation({
    mutationFn: () => saveOwnBot({ enabled: enabled ?? (state?.configured ? state.enabled : true), ...(token.trim() ? { botToken: token.trim() } : {}) }),
    onSuccess: (next) => {
      qc.setQueryData(['notify', 'own-bot'], next)
      setToken('')
      setEnabled(null)
      refreshChannel()
      toast.success(t('notify.own.saved'))
    },
    onError: (e) => toast.error(apiError(e, t('notify.own.saveFailed'))),
  })
  const remove = useMutation({
    mutationFn: removeOwnBot,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notify', 'own-bot'] })
      setToken('')
      setEnabled(null)
      refreshChannel()
      toast.success(t('notify.own.removed'))
    },
    onError: (e) => toast.error(apiError(e, t('notify.own.saveFailed'))),
  })

  if (query.isLoading || query.isError || !state || (!state.allowed && !state.configured)) return null

  const locked = !state.allowed
  // a bot that is being added starts switched on
  const on = enabled ?? (state.configured ? state.enabled : true)
  const dirty = token.trim() !== '' || (state.configured && on !== state.enabled)
  const tone = !state.configured || !state.enabled ? 'neutral' : state.status === 'error' ? 'danger' : 'success'
  const label = !state.configured || !state.enabled ? t('notify.own.off') : state.status === 'error' ? t('notify.own.error') : t('notify.own.active')

  const askRemove = async () => {
    const ok = await alertLib.confirm(
      t('notify.own.removeQuestion'),
      t('notify.own.removeMessage', { bot: state.botUsername }),
      t('notify.own.remove'),
      t('common.cancel'),
      'warning',
      'profile',
    )
    if (ok) remove.mutate()
  }

  return (
    <div className="panel-shell-card flex flex-col gap-3.5 settings-card">
      <SectionHeader
        icon={<Bot />}
        title={t('notify.own.title')}
        subtitle={state.configured && state.botUsername ? `@${state.botUsername}` : t('notify.own.subtitle')}
        tone="primary"
        className="mb-0"
        actions={state.configured ? <Badge tone={tone} dot>{label}</Badge> : undefined}
      />

      {locked ? <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('notify.own.locked')}</p> : null}
      {state.configured && state.lastError ? <p className="text-[0.75rem] text-[var(--panel-danger-text)]">{state.lastError}</p> : null}

      {!locked ? (
        <>
          <details className="text-[0.8125rem]">
            <summary className="cursor-pointer text-[var(--text-secondary)]">{t('notify.own.howTitle')}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-secondary)]">
              <li>{t('notify.own.how1')}</li>
              <li>{t('notify.own.how2')}</li>
              <li>{t('notify.own.how3')}</li>
            </ol>
          </details>

          <Field label={t('notify.own.token')} htmlFor="own-bot-token" hint={state.configured ? t('notify.own.tokenSaved') : t('notify.own.tokenHint')}>
            <TextInput
              id="own-bot-token"
              mono
              type="password"
              autoComplete="off"
              value={token}
              placeholder={t('notify.own.tokenPlaceholder')}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>

          <SettingRow
            title={t('notify.own.enable')}
            description={t('notify.own.enableHint')}
            control={<ToggleSwitch checked={on} disabled={!state.configured && token.trim() === ''} label={t('notify.own.enable')} onChange={() => setEnabled(!on)} />}
          />
        </>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 notice-foot">
        {state.configured ? (
          <Button variant="danger-soft" icon={<Trash2 className="h-3.5 w-3.5" />} loading={remove.isPending} onClick={() => void askRemove()}>
            {t('notify.own.remove')}
          </Button>
        ) : (
          <span />
        )}
        {!locked ? (
          <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            {t('notify.own.save')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
