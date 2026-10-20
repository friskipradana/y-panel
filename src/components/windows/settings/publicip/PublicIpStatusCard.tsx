import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, LocateFixed } from 'lucide-react'
import { toast } from 'sonner'
import { detectPublicIp, getPublicProxy, setPublicProxy, type DetectedIp } from '@/api/publicProxy'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { DateTimeText } from '@/components/common/DateTimeText'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'
import { PublicIpConfirmModal } from './PublicIpConfirmModal'
import { localizeServerMessage } from '@/lib/serverMessages'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The switch of the public proxy, and what the superadmin needs to know before turning it on: the address of this machine,
// and whether the web ports reach it
export function PublicIpStatusCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['public-proxy'], queryFn: getPublicProxy, retry: 0, refetchInterval: 15_000 })
  const [email, setEmail] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectedIp | null>(null)
  const [confirming, setConfirming] = useState(false)

  const save = useMutation({
    mutationFn: (body: { enabled?: boolean; email?: string; confirmPublicIp?: boolean }) => setPublicProxy(body),
    onSuccess: (next) => {
      qc.setQueryData(['public-proxy'], next)
      setConfirming(false)
      void qc.invalidateQueries({ queryKey: ['public-proxy', 'routes'] })
      setEmail(null)
      toast.success(t('publicip.saved'))
    },
    onError: (e) => toast.error(apiError(e, t('publicip.saveFailed'))),
  })
  const detect = useMutation({
    mutationFn: detectPublicIp,
    onSuccess: setDetected,
    onError: (e) => toast.error(apiError(e, t('publicip.detectFailed'))),
  })

  const data = status.data
  const badge = !data ? null : data.running ? (
    <Badge tone="success" dot>{t('publicip.state.running')}</Badge>
  ) : data.error ? (
    <Badge tone="danger" dot>{t('publicip.state.error')}</Badge>
  ) : (
    <Badge tone="neutral" dot>{t('publicip.state.off')}</Badge>
  )
  const emailValue = email ?? data?.email ?? ''
  const publicAddresses = data?.addresses.filter((a) => a.public) ?? []

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <SectionHeader icon={<Globe2 />} title={t('publicip.title')} subtitle={t('publicip.subtitle')} tone="primary" className="mb-0" actions={badge} />
      {status.isLoading ? <LoadingState>{t('publicip.loading')}</LoadingState> : null}
      {status.isError || (!status.isLoading && !data) ? <ErrorState title={t('publicip.loadFailed')} hint={t('hosting.plans.loadFailedHint')} /> : null}
      {data ? (
        <>
          <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('publicip.when')}</p>

          <SettingRow
            title={t('publicip.toggle')}
            description={t('publicip.toggleHint', { http: data.wantHttp, https: data.wantHttps })}
            control={<ToggleSwitch checked={data.enabled} disabled={save.isPending} label={t('publicip.toggle')} onChange={() => (data.enabled ? save.mutate({ enabled: false }) : setConfirming(true))} />}
          />
          {data.enabled && data.confirmedBy && data.confirmedAt ? (
            <p className="text-[0.75rem] text-[var(--text-secondary)]">
              {t('publicip.confirmedBy', { user: data.confirmedBy })} <DateTimeText value={data.confirmedAt} />
            </p>
          ) : null}
          {data.error ? <p role="alert" className="text-[0.75rem] text-[var(--panel-danger-text)]">{localizeServerMessage(data.error) ?? data.error}</p> : null}
          {data.running && data.https ? <p className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">{t('publicip.listening', { http: data.http ?? '-', https: data.https })}</p> : null}

          <Field label={t('publicip.email')} hint={t('publicip.emailHint')}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <TextInput type="email" value={emailValue} placeholder={t('publicip.emailPlaceholder')} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button variant="outline" disabled={email === null || email.trim() === (data.email ?? '')} loading={save.isPending} onClick={() => save.mutate({ email: (email ?? '').trim() })}>
                {t('common.save')}
              </Button>
            </div>
          </Field>

          <div className="space-y-2 border-t border-[var(--win-border)] pt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-medium text-[var(--win-text)]">{t('publicip.addresses')}</p>
                <p className="text-[0.75rem] text-[var(--text-secondary)]">{publicAddresses.length > 0 ? t('publicip.addressesPublic') : t('publicip.addressesNone')}</p>
              </div>
              <Button variant="outline" icon={<LocateFixed className="h-3.5 w-3.5" />} loading={detect.isPending} onClick={() => detect.mutate()}>
                {t('publicip.detect')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.addresses.map((a) => (
                <Badge key={a.ip} tone={a.public ? 'success' : 'neutral'}><span className="panel-mono">{a.ip}</span></Badge>
              ))}
            </div>
            {detected ? (
              <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed">
                <span className="panel-mono font-semibold">{detected.ip}</span>
                {' - '}
                {detected.onThisMachine ? t('publicip.detected.direct') : t('publicip.detected.nat')}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      {data ? (
        <PublicIpConfirmModal
          open={confirming}
          addresses={data.addresses}
          wantHttp={data.wantHttp}
          wantHttps={data.wantHttps}
          loading={save.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => save.mutate({ enabled: true, confirmPublicIp: true })}
        />
      ) : null}
    </div>
  )
}
