import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Link2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { checkTelegramLink, setTelegramMuted, startTelegramLink, testTelegram, unlinkTelegram, type NotifyChannel, type NotifyLink, type NotifyOverview, type NotifyRecipient } from '@/api/notify'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const GROUPS = ['security', 'attack', 'order', 'plan', 'domain'] as const

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Where the notices of this account go: the link to a Telegram chat, and which kinds of notice are wanted
export function MyTelegram({ channel, recipient, groups = GROUPS, bare }: { channel: NotifyChannel | undefined; recipient: NotifyRecipient | undefined; groups?: readonly string[]; bare?: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [link, setLink] = useState<NotifyLink | null>(null)
  const ready = !!channel?.configured && !!channel.enabled

  const setOverview = (patch: Partial<NotifyOverview>) =>
    qc.setQueryData<NotifyOverview>(['notify', 'overview'], (old) => (old ? { ...old, ...patch } : old))

  const start = useMutation({
    mutationFn: startTelegramLink,
    onSuccess: setLink,
    onError: (error) => toast.error(apiError(error, t('notify.me.linkFailed'))),
  })

  // while a link waits, the panel asks every few seconds whether the Start message came, and stops when the code runs out
  const waiting = link !== null && !recipient?.linked
  const check = useQuery({
    queryKey: ['notify', 'link-check'],
    queryFn: checkTelegramLink,
    enabled: waiting,
    refetchInterval: waiting ? 3000 : false,
    retry: 0,
  })
  useEffect(() => {
    if (!check.data?.linked) return
    setLink(null)
    setOverview({ telegram: check.data.telegram })
    toast.success(t('notify.me.linkedToast'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.data])
  useEffect(() => {
    if (!link) return
    const left = new Date(link.expiresAt).getTime() - Date.now()
    const timer = window.setTimeout(() => setLink(null), Math.max(left, 0))
    return () => window.clearTimeout(timer)
  }, [link])

  const muted = useMutation({
    mutationFn: setTelegramMuted,
    onSuccess: (telegram) => setOverview({ telegram }),
    onError: (error) => toast.error(apiError(error, t('notify.me.saveFailed'))),
  })
  const test = useMutation({
    mutationFn: testTelegram,
    onSuccess: () => {
      toast.success(t('notify.telegram.testQueued'))
      void qc.invalidateQueries({ queryKey: ['notify', 'outbox'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.telegram.testFailed'))),
  })
  const unlink = useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: () => {
      setOverview({ telegram: { linked: false, address: '', verifiedAt: null, blocked: false, mutedEvents: [], pendingUntil: null } })
      setLink(null)
    },
    onError: (error) => toast.error(apiError(error, t('notify.me.saveFailed'))),
  })

  const toggleGroup = (group: string) => {
    const current = recipient?.mutedEvents ?? []
    muted.mutate(current.includes(group) ? current.filter((g) => g !== group) : [...current, group])
  }
  const confirmUnlink = async () => {
    const ok = await alertLib.confirm(t('notify.me.disconnectTitle'), t('notify.me.disconnectMessage'), t('notify.me.disconnect'), t('common.cancel'), 'warning', 'settings')
    if (ok) unlink.mutate()
  }

  return (
    <div className={bare ? 'flex flex-col gap-4' : 'panel-shell-card flex flex-col gap-4 settings-card'}>
      <SectionHeader
        icon={<Link2 />}
        title={t('notify.me.title')}
        subtitle={t('notify.me.subtitle')}
        actions={
          recipient?.linked ? (
            <Badge tone={recipient.blocked ? 'danger' : 'success'} dot>
              {recipient.blocked ? t('notify.me.blockedBadge') : t('notify.me.linked')}
            </Badge>
          ) : undefined
        }
      />

      {recipient?.linked ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5 text-[12.5px]">
            <div className="min-w-0">
              <p className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.me.chat')}</p>
              <p className="panel-mono font-semibold">{recipient.address}</p>
              {recipient.verifiedAt ? (
                <p className="text-[11.5px] text-[var(--text-secondary)]">
                  {t('notify.me.since')} <DateTimeText value={recipient.verifiedAt} />
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!ready || !!recipient.blocked} loading={test.isPending} onClick={() => test.mutate()}>
                {t('notify.telegram.test')}
              </Button>
              <Button variant="danger-soft" size="sm" icon={<Unlink className="h-3.5 w-3.5" />} loading={unlink.isPending} onClick={() => void confirmUnlink()}>
                {t('notify.me.disconnect')}
              </Button>
            </div>
          </div>
          {recipient.blocked ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{t('notify.me.blocked')}</p> : null}

          <div className="flex flex-col gap-1">
            <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('notify.me.which')}</p>
            {groups.map((group) => (
              <SettingRow
                key={group}
                title={t(`notify.group.${group}`)}
                description={t(`notify.group.${group}.hint`)}
                control={
                  <ToggleSwitch
                    checked={!(recipient.mutedEvents ?? []).includes(group)}
                    disabled={muted.isPending}
                    label={t(`notify.group.${group}`)}
                    onChange={() => toggleGroup(group)}
                  />
                }
              />
            ))}
          </div>
        </>
      ) : link ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[12.5px]">
          <p className="font-medium">{t('notify.me.linkTitle')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}>
              {t('notify.me.openTelegram')}
            </Button>
            <span className="text-[var(--text-secondary)]">{t('notify.me.code')}</span>
            <span className="panel-mono rounded-md border border-[var(--win-border)] px-2 py-1 font-semibold">{link.code}</span>
            <IconButton label={t('notify.me.copyCode')} onClick={() => void copyTextToClipboard(link.url).then(() => toast.success(t('common.copied')))}>
              <Copy className="h-4 w-4" />
            </IconButton>
          </div>
          <p className="text-[var(--text-secondary)]">
            {t('notify.me.waiting')} <DateTimeText value={link.expiresAt} />
          </p>
          {check.isError ? <p role="alert" className="text-[var(--panel-danger-text)]">{apiError(check.error, t('notify.me.linkFailed'))}</p> : null}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setLink(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[12.5px] text-[var(--text-secondary)]">{ready ? t('notify.me.notLinked') : t('notify.me.needsBot')}</p>
          <Button variant="primary" disabled={!ready} loading={start.isPending} icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => start.mutate()}>
            {t('notify.me.connect')}
          </Button>
        </div>
      )}
    </div>
  )
}
