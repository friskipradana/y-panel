import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { removeCloudNumber, setCloudMuted, setCloudNumber, testCloud, type NotifyChannel, type NotifyOverview, type NotifyRecipient } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const GROUPS = ['security', 'attack', 'order', 'plan', 'domain'] as const

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The number of the owner for WhatsApp Cloud: typed here, and a test message shows whether Meta delivers to it
export function MyCloudNumber({ channel, recipient }: { channel: NotifyChannel | undefined; recipient: NotifyRecipient | undefined }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [number, setNumber] = useState('')
  const ready = !!channel?.configured && !!channel.enabled
  const setOverview = (patch: Partial<NotifyOverview>) =>
    qc.setQueryData<NotifyOverview>(['notify', 'overview'], (old) => (old ? { ...old, ...patch } : old))

  const save = useMutation({
    mutationFn: () => setCloudNumber(number),
    onSuccess: (whatsappCloud) => {
      setOverview({ whatsappCloud })
      setNumber('')
      toast.success(t('notify.cloud.numberSaved'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.cloud.numberFailed'))),
  })
  const test = useMutation({
    mutationFn: testCloud,
    onSuccess: () => {
      toast.success(t('notify.wa.testQueued'))
      void qc.invalidateQueries({ queryKey: ['notify', 'outbox'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.testFailed'))),
  })
  const muted = useMutation({
    mutationFn: setCloudMuted,
    onSuccess: (whatsappCloud) => setOverview({ whatsappCloud }),
    onError: (error) => toast.error(apiError(error, t('notify.me.saveFailed'))),
  })
  const remove = useMutation({
    mutationFn: removeCloudNumber,
    onSuccess: () => setOverview({ whatsappCloud: { linked: false, address: '', verifiedAt: null, blocked: false, mutedEvents: [], pendingUntil: null } }),
    onError: (error) => toast.error(apiError(error, t('notify.me.saveFailed'))),
  })

  const confirmRemove = async () => {
    const ok = await alertLib.confirm(t('notify.cloud.removeTitle'), t('notify.cloud.removeMessage'), t('notify.cloud.remove'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate()
  }
  const toggleGroup = (group: string) => {
    const current = recipient?.mutedEvents ?? []
    muted.mutate(current.includes(group) ? current.filter((g) => g !== group) : [...current, group])
  }

  return (
    <div className="panel-shell-card flex flex-col gap-4 settings-card">
      <SectionHeader
        icon={<Phone />}
        title={t('notify.cloud.mineTitle')}
        subtitle={t('notify.cloud.mineSubtitle')}
        actions={recipient?.linked ? <Badge tone="success" dot>{t('notify.me.linked')}</Badge> : undefined}
      />

      {recipient?.linked ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5 text-[12.5px]">
            <div className="min-w-0">
              <p className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.wa.number')}</p>
              <p className="panel-mono font-semibold">{recipient.address}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!ready} loading={test.isPending} onClick={() => test.mutate()}>
                {t('notify.telegram.test')}
              </Button>
              <Button variant="danger-soft" size="sm" icon={<Unlink className="h-3.5 w-3.5" />} loading={remove.isPending} onClick={() => void confirmRemove()}>
                {t('notify.cloud.remove')}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('notify.me.which')}</p>
            {GROUPS.map((group) => (
              <SettingRow
                key={group}
                title={t(`notify.group.${group}`)}
                description={t(`notify.group.${group}.hint`)}
                control={
                  <ToggleSwitch
                    checked={!recipient.mutedEvents.includes(group)}
                    disabled={muted.isPending}
                    label={t(`notify.group.${group}`)}
                    onChange={() => toggleGroup(group)}
                  />
                }
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label={t('notify.cloud.numberLabel')} htmlFor="notify-cloud-number" hint={ready ? t('notify.cloud.numberHint') : t('notify.cloud.needsChannel')}>
            <TextInput id="notify-cloud-number" mono type="tel" inputMode="tel" placeholder="0812 3456 7890" disabled={!ready} value={number} onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <div>
            <Button variant="primary" disabled={!ready || number.trim() === ''} loading={save.isPending} onClick={() => save.mutate()}>
              {t('notify.cloud.saveNumber')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
