import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, PlugZap, RotateCw, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { connectWhatsApp, disconnectWhatsApp, getMyWhatsApp, getWhatsAppQR, restartWhatsApp, setWhatsAppDestination, setWhatsAppMuted, testWhatsApp, type MyWhatsApp } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const KEY = ['whatsapp', 'me']

// The WhatsApp of this account: connect a phone by scanning a code, and choose which notices come to it.
// `groups` are the kinds of notice this account can get; the owner has more than the others.
export function MyWhatsAppCard({ groups, ownerHint = false, bare }: { groups: readonly string[]; ownerHint?: boolean; bare?: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: KEY,
    queryFn: getMyWhatsApp,
    retry: 0,
    // while a phone is being connected the page asks every few seconds whether the scan happened
    refetchInterval: (query) => (query.state.data?.status === 'SCAN_QR_CODE' || query.state.data?.status === 'STARTING' ? 3000 : false),
  })
  const data = me.data
  const scanning = data?.status === 'SCAN_QR_CODE'
  const set = (next: MyWhatsApp) => qc.setQueryData(KEY, next)

  const qr = useQuery({ queryKey: ['whatsapp', 'qr'], queryFn: getWhatsAppQR, enabled: scanning, retry: 0, refetchInterval: scanning ? 15000 : false })
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    if (!qr.data) return
    const url = URL.createObjectURL(qr.data)
    setImage(url)
    return () => URL.revokeObjectURL(url)
  }, [qr.data])

  const connect = useMutation({
    mutationFn: connectWhatsApp,
    onSuccess: set,
    onError: (error) => toast.error(apiError(error, t('notify.wa.connectFailed'))),
  })
  const [editing, setEditing] = useState(false)
  const [number, setNumber] = useState('')
  const destination = useMutation({
    mutationFn: (value: string) => setWhatsAppDestination(value),
    onSuccess: (next) => {
      set(next)
      setEditing(false)
      setNumber('')
      toast.success(t('notify.wa.destinationSaved'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.destinationFailed'))),
  })
  const restart = useMutation({
    mutationFn: restartWhatsApp,
    onSuccess: (next) => {
      set(next)
      setImage(null)
      void qc.invalidateQueries({ queryKey: ['whatsapp', 'qr'] })
      toast.success(t('notify.wa.restarted'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.restartFailed'))),
  })
  const disconnect = useMutation({
    mutationFn: disconnectWhatsApp,
    onSuccess: () => {
      setImage(null)
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['notify', 'waha'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.disconnectFailed'))),
  })
  const test = useMutation({
    mutationFn: testWhatsApp,
    onSuccess: () => {
      toast.success(t('notify.wa.testQueued'))
      void qc.invalidateQueries({ queryKey: ['notify', 'outbox'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.testFailed'))),
  })
  const muted = useMutation({
    mutationFn: setWhatsAppMuted,
    onSuccess: (recipient) => data && set({ ...data, recipient }),
    onError: (error) => toast.error(apiError(error, t('notify.me.saveFailed'))),
  })

  const confirmDisconnect = async () => {
    const ok = await alertLib.confirm(t('notify.wa.disconnectTitle'), t('notify.wa.disconnectMessage'), t('notify.wa.disconnect'), t('common.cancel'), 'warning', 'settings')
    if (ok) disconnect.mutate()
  }
  const toggleGroup = (group: string) => {
    const current = data?.recipient.mutedEvents ?? []
    muted.mutate(current.includes(group) ? current.filter((g) => g !== group) : [...current, group])
  }

  const connected = !!data?.connected && !!data.recipient.linked
  const badge = connected ? (
    <Badge tone="success" dot>{t('notify.me.linked')}</Badge>
  ) : scanning ? (
    <Badge tone="warning" dot>{t('notify.wa.waitingScan')}</Badge>
  ) : undefined

  return (
    <div className={bare ? 'flex flex-col gap-3' : 'panel-shell-card flex flex-col gap-3.5 settings-card'}>
      <SectionHeader icon={<MessageCircle />} title={t('notify.wa.title')} subtitle={t('notify.wa.subtitle')} actions={badge} />

      {me.isLoading ? (
        <LoadingState>{t('notify.wa.loading')}</LoadingState>
      ) : me.isError || !data ? (
        <ErrorState title={t('notify.wa.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
      ) : !data.available ? (
        <p className="text-[12px] text-[var(--text-secondary)]">{ownerHint ? t('notify.wa.offOwner') : t('notify.wa.offUser')}</p>
      ) : connected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12px]">
            <div className="min-w-0 flex items-center gap-3">
              <div>
                <span className="block text-[11px] text-[var(--text-secondary)]">{t('notify.wa.number')}</span>
                <span className="panel-mono font-semibold text-[13px] text-[var(--win-text)]">{data.phone}</span>
              </div>
              <span className="panel-mono rounded border border-[var(--win-border)] bg-[var(--panel-surface-hover)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                {data.sessionName}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" loading={test.isPending} onClick={() => test.mutate()}>
                {t('notify.telegram.test')}
              </Button>
              <Button variant="outline" size="sm" icon={<RotateCw className="h-3.5 w-3.5" />} loading={restart.isPending} onClick={() => restart.mutate()}>
                {t('notify.wa.restart')}
              </Button>
              <Button variant="danger-soft" size="sm" icon={<Unplug className="h-3.5 w-3.5" />} loading={disconnect.isPending} onClick={() => void confirmDisconnect()}>
                {t('notify.wa.disconnect')}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-[11px] text-[var(--text-secondary)]">{t('notify.wa.destination')}</span>
                <span className="flex items-center gap-2">
                  <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)]">{data.recipient.address}</span>
                  {data.destinationIsSession ? <Badge tone="warning" size="sm">{t('notify.wa.ownNumber')}</Badge> : null}
                </span>
              </div>
              {!editing ? (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    {t('notify.wa.changeDestination')}
                  </Button>
                  {!data.destinationIsSession ? (
                    <Button variant="ghost" size="sm" loading={destination.isPending} onClick={() => destination.mutate('')}>
                      {t('notify.wa.useSessionNumber')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {data.destinationIsSession && !editing ? <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{t('notify.wa.ownNumberHint')}</p> : null}
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[200px] flex-1">
                  <TextInput mono type="tel" inputMode="tel" autoComplete="off" placeholder="0812 3456 7890" value={number} onChange={(e) => setNumber(e.target.value)} className="!h-8 text-[12px]" />
                </div>
                <Button variant="primary" size="sm" disabled={number.trim() === ''} loading={destination.isPending} onClick={() => destination.mutate(number)}>
                  {t('common.save')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                    setNumber('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-[11.5px] font-medium text-[var(--text-secondary)]">{t('notify.me.which')}</p>
            {groups.map((group) => (
              <SettingRow
                key={group}
                title={t(`notify.group.${group}`)}
                description={t(`notify.group.${group}.hint`)}
                control={
                  <ToggleSwitch
                    checked={!data.recipient.mutedEvents.includes(group)}
                    disabled={muted.isPending}
                    label={t(`notify.group.${group}`)}
                    onChange={() => toggleGroup(group)}
                  />
                }
              />
            ))}
          </div>
        </>
      ) : scanning || data.status === 'STARTING' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-6 lg:gap-12 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 sm:p-6 text-[12px]">
          <div className="flex flex-col justify-between gap-5 py-1">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] text-[11px] font-bold text-[var(--panel-primary-text)]">
                  1
                </span>
                <p className="pt-0.5 text-[12.5px] font-medium leading-snug text-[var(--win-text)]">{t('notify.wa.step1')}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] text-[11px] font-bold text-[var(--panel-primary-text)]">
                  2
                </span>
                <p className="pt-0.5 text-[12.5px] font-medium leading-snug text-[var(--win-text)]">{t('notify.wa.step2')}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] text-[11px] font-bold text-[var(--panel-primary-text)]">
                  3
                </span>
                <p className="pt-0.5 text-[12.5px] font-medium leading-snug text-[var(--win-text)]">{t('notify.wa.step3')}</p>
              </div>
            </div>

            {qr.isError ? <p role="alert" className="text-[11.5px] text-[var(--panel-danger-text)]">{apiError(qr.error, t('notify.wa.qrFailed'))}</p> : null}

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--win-border)]">
              <Button
                variant="outline"
                size="sm"
                icon={<RotateCw className="h-3.5 w-3.5" />}
                loading={restart.isPending}
                onClick={() => restart.mutate()}
              >
                {t('notify.wa.restart')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-2.5 py-1">
            <div className="flex h-44 w-44 sm:h-48 sm:w-48 items-center justify-center rounded-2xl border border-[var(--win-border)] bg-white p-3 shadow-md">
              {image && scanning ? (
                <img src={image} alt={t('notify.wa.qrAlt')} className="h-full w-full object-contain" />
              ) : (
                <LoadingState>{t('notify.wa.qrLoading')}</LoadingState>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--win-border)] bg-[var(--panel-surface-hover)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
              <span className="h-2 w-2 rounded-full bg-[var(--panel-warning-text)] animate-pulse" />
              <span className="font-medium text-[var(--win-text)]">{t('notify.wa.waitingScan')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12px]">
          <div className="min-w-0">
            {data.status === 'FAILED' || data.status === 'EXPIRED' ? (
              <p role="alert" className="mb-0.5 text-[11.5px] text-[var(--panel-danger-text)]">{t(data.status === 'EXPIRED' ? 'notify.wa.expired' : 'notify.wa.failed')}</p>
            ) : null}
            <p className="text-[12px] text-[var(--text-secondary)]">{t('notify.wa.notConnected')}</p>
          </div>
          {data.status === 'FAILED' || data.status === 'EXPIRED' ? (
            <Button variant="primary" size="sm" icon={<RotateCw className="h-3.5 w-3.5" />} loading={restart.isPending} onClick={() => restart.mutate()}>
              {t('notify.wa.restart')}
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<PlugZap className="h-3.5 w-3.5" />} loading={connect.isPending} onClick={() => connect.mutate()}>
              {t('notify.wa.connect')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
