import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  getEmailSettings,
  openEmailFirewallPorts,
  saveEmailSettings,
  syncEmailCloudflareDNS,
  testEmailSettings,
  type EmailServerConfig,
} from '@/api/email'
import { detectPublicIp } from '@/api/publicProxy'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'
import { useWindowStore } from '@/store/windowStore'
import { EmailCloudflareCard } from '../email/EmailCloudflareCard'
import { EmailDnsAndTestCard } from '../email/EmailDnsAndTestCard'
import { EmailIpServerCard } from '../email/EmailIpServerCard'
import { EmailMethodCard } from '../email/EmailMethodCard'
import { SettingsSaveBar } from '../SettingsSaveBar'

const DEFAULT_FORM: EmailServerConfig = {
  enabled: false,
  method: 'cloudflare',
  domain: '',
  fromName: 'Reneo Mail',
  fromAddress: '',
  cfZoneId: '',
  cfCatchAll: false,
  cfForwardTo: '',
  cfOutboundRelay: 'smtp',
  mailHostname: '',
  publicIp: '',
  smtpHost: '127.0.0.1',
  smtpPort: 25,
  submissionPort: 587,
  smtpsPort: 465,
  imapPort: 993,
  tlsMode: 'starttls',
  smtpUser: '',
  smtpPasswordSet: false,
  dkimSelector: 'default',
  dkimPublicKey: '',
}

const getApiError = (err: unknown, fallback: string) => {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ? (localizeServerMessage(msg) ?? msg) : fallback
}

let workingDraftForm: EmailServerConfig | null = null
let workingDraftPassword = ''

export function EmailServerTab() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const openWindow = useWindowStore((s) => s.openWindow)

  const query = useQuery({
    queryKey: ['settings-email'],
    queryFn: getEmailSettings,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })

  const [form, setForm] = useState<EmailServerConfig>(() => workingDraftForm ?? DEFAULT_FORM)
  const [smtpPassword, setSmtpPassword] = useState(() => workingDraftPassword)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (query.data?.config && !isInitializedRef.current) {
      isInitializedRef.current = true
      if (!workingDraftForm) {
        setForm(query.data.config)
        setSmtpPassword('')
      }
    }
  }, [query.data?.config])

  const updateField = <K extends keyof EmailServerConfig>(key: K, value: EmailServerConfig[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      workingDraftForm = next
      return next
    })
  }

  const handleSmtpPasswordChange = (value: string) => {
    setSmtpPassword(value)
    workingDraftPassword = value
  }

  const isDirty = useMemo(() => {
    const base = query.data?.config
    if (!base) return false
    if (smtpPassword.trim().length > 0) return true
    return (
      form.enabled !== base.enabled ||
      form.method !== base.method ||
      form.domain !== base.domain ||
      form.fromName !== base.fromName ||
      form.fromAddress !== base.fromAddress ||
      form.cfZoneId !== base.cfZoneId ||
      form.cfCatchAll !== base.cfCatchAll ||
      form.cfForwardTo !== base.cfForwardTo ||
      form.cfOutboundRelay !== base.cfOutboundRelay ||
      form.mailHostname !== base.mailHostname ||
      form.publicIp !== base.publicIp ||
      form.smtpHost !== base.smtpHost ||
      form.smtpPort !== base.smtpPort ||
      form.submissionPort !== base.submissionPort ||
      form.smtpsPort !== base.smtpsPort ||
      form.imapPort !== base.imapPort ||
      form.tlsMode !== base.tlsMode ||
      form.smtpUser !== base.smtpUser ||
      form.dkimSelector !== base.dkimSelector ||
      form.dkimPublicKey !== base.dkimPublicKey
    )
  }, [form, query.data?.config, smtpPassword])

  const saveMut = useMutation({
    mutationFn: () =>
      saveEmailSettings({
        ...form,
        smtpPassword: smtpPassword.trim() || undefined,
      }),
    onSuccess: (next) => {
      qc.setQueryData(['settings-email'], next)
      void qc.invalidateQueries({ queryKey: ['email-overview'] })
      workingDraftForm = null
      workingDraftPassword = ''
      if (next.config) {
        setForm(next.config)
      }
      setSmtpPassword('')
      toast.success(t('email.settings.saved'))
    },
    onError: (err) => toast.error(getApiError(err, t('email.settings.saveFailed'))),
  })

  const detectIpMut = useMutation({
    mutationFn: detectPublicIp,
    onSuccess: (res) => {
      if (res.ip) {
        updateField('publicIp', res.ip)
        toast.success(t('email.settings.ipDetected', { ip: res.ip }))
      }
    },
    onError: (err) => toast.error(getApiError(err, t('publicip.detectFailed'))),
  })

  const firewallMut = useMutation({
    mutationFn: openEmailFirewallPorts,
    onSuccess: () => {
      void query.refetch()
      toast.success(t('email.settings.firewallOpened'))
    },
    onError: (err) => toast.error(getApiError(err, t('firewall.failed'))),
  })

  const dnsSyncMut = useMutation({
    mutationFn: syncEmailCloudflareDNS,
    onSuccess: (res) => {
      void query.refetch()
      void qc.invalidateQueries({ queryKey: ['email-overview'] })
      toast.success(t('email.settings.dnsSynced', { created: res.created, skipped: res.skipped }))
    },
    onError: (err) => toast.error(getApiError(err, t('email.settings.dnsSyncFailed'))),
  })

  const testMut = useMutation({
    mutationFn: (to?: string) => testEmailSettings(to),
    onSuccess: (res) => {
      if (res.sentTo) {
        toast.success(t('email.settings.testSent', { to: res.sentTo }))
      } else {
        toast.success(t('email.settings.testSuccess'))
      }
    },
    onError: (err: unknown) => {
      const serverErr = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const isWorkerOutbound = form.method === 'cloudflare' && form.cfOutboundRelay === 'worker'
      const detail = serverErr || (isWorkerOutbound ? t('email.settings.workerOutboundNote') : undefined)
      toast.error(t('email.settings.testFailed'), {
        description: detail,
      })
    },
  })

  if (query.isLoading) {
    return <LoadingState>{t('email.settings.loading')}</LoadingState>
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-3">
        <ErrorState
          title={t('email.settings.loadFailed')}
          hint={t('settings.payment.loadFailedHint')}
        />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    )
  }

  const handleReset = () => {
    workingDraftForm = null
    workingDraftPassword = ''
    if (query.data?.config) {
      setForm(query.data.config)
      setSmtpPassword('')
    }
  }

  return (
    <div className="space-y-6">
      <EmailMethodCard
        form={form}
        onChange={updateField}
        onOpenEmailWindow={() => openWindow('email')}
      />

      {form.method === 'cloudflare' ? (
        <EmailCloudflareCard
          form={form}
          smtpPassword={smtpPassword}
          onSmtpPasswordChange={handleSmtpPasswordChange}
          cloudflareReady={query.data.cloudflareReady}
          zones={query.data.cloudflareZones}
          onChange={updateField}
        />
      ) : (
        <EmailIpServerCard
          form={form}
          smtpPassword={smtpPassword}
          onSmtpPasswordChange={handleSmtpPasswordChange}
          firewall={query.data.firewall}
          detectingIp={detectIpMut.isPending}
          openingPorts={firewallMut.isPending}
          onDetectPublicIp={() => detectIpMut.mutate()}
          onOpenFirewallPorts={() => firewallMut.mutate()}
          onChange={updateField}
        />
      )}

      <EmailDnsAndTestCard
        records={query.data.dnsRecords}
        cloudflareReady={query.data.cloudflareReady}
        isDirty={isDirty}
        syncingDns={dnsSyncMut.isPending}
        testing={testMut.isPending}
        refreshing={query.isFetching}
        method={form.method}
        cfOutboundRelay={form.cfOutboundRelay}
        onSyncDns={() => dnsSyncMut.mutate()}
        onRefresh={() => void query.refetch()}
        onTest={(to) => testMut.mutate(to)}
      />

      <SettingsSaveBar
        id="email-save-settings"
        title={t('email.settings.saveTitle')}
        hint={isDirty ? t('email.settings.unsavedChanges') : t('email.settings.noChanges')}
        dirty={isDirty}
        pending={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        saveLabel={t('common.save')}
        pendingLabel={t('settings.saving')}
        extra={
          isDirty ? (
            <Button
              type="button"
              variant="ghost"
              size="md"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={handleReset}
            >
              {t('common.reset')}
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
