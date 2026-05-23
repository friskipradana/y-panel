import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCFConfig, setCFConfig, verifyCFConfig, deleteCFConfig } from '@/api/agent'
import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import {
  Cloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  ShieldCheck,
  User,
  LockKeyhole,
  Globe2,
} from 'lucide-react'

const CF_STATUS_VARIANTS = {
  active: { cls: 'panel-badge panel-badge--success', icon: <CheckCircle2 className="h-3 w-3" />, labelKey: 'profile.statusVerified' },
  invalid: { cls: 'panel-badge panel-badge--danger', icon: <XCircle className="h-3 w-3" />, labelKey: 'profile.statusInvalid' },
  unconfigured: { cls: 'panel-badge panel-badge--warning', icon: <AlertTriangle className="h-3 w-3" />, labelKey: 'profile.statusUnverified' },
} as const

export default function ProfileWindow() {
  const qc = useQueryClient()
  const { t } = useI18n()
  const [cfForm, setCfForm] = useState({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
  const [showToken, setShowToken] = useState(false)

  const { data: cf, isLoading: cfLoading } = useQuery({ queryKey: ['cf-config'], queryFn: getCFConfig })

  const saveCFMut = useMutation({
    mutationFn: setCFConfig,
    onSuccess: () => {
      alertLib.fire(t('profile.cloudflareSavedTitle'), t('profile.cloudflareSavedMessage'), 'success', 'profile')
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
      setCfForm({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? t('profile.saveConfigFailed')
      toast.error(t('profile.saveConfigFailed'), { description: message })
      alertLib.fire(t('profile.cloudflareSaveFailedTitle'), message, 'error', 'profile')
    },
  })

  const verifyMut = useMutation({
    mutationFn: verifyCFConfig,
    onSuccess: (res) => {
      if (res.valid) {
        alertLib.fire(t('profile.verifySuccessTitle'), t('profile.verifySuccessMessage'), 'success', 'profile')
      } else {
        alertLib.fire(t('profile.invalidTokenTitle'), res.error ?? t('profile.unknownError'), 'warning', 'profile')
      }
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
    },
    onError: () => {
      toast.error(t('profile.verifyFailedToast'))
      alertLib.fire(t('profile.verifyFailedTitle'), t('profile.verifyFailedMessage'), 'error', 'profile')
    },
  })

  const deleteCFMut = useMutation({
    mutationFn: deleteCFConfig,
    onSuccess: () => {
      alertLib.fire(t('profile.cloudflareDeletedTitle'), t('profile.cloudflareDeletedMessage'), 'success', 'profile')
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
    },
    onError: (e: any) => alertLib.fire(t('profile.cloudflareDeleteFailedTitle'), e.response?.data?.error ?? t('profile.cloudflareDeleteFailedMessage'), 'error', 'profile'),
  })

  const cfStatus = cf?.status
  const cfStatusBadge = CF_STATUS_VARIANTS[cfStatus as keyof typeof CF_STATUS_VARIANTS] ?? CF_STATUS_VARIANTS.unconfigured

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <User className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">{t('profile.windowTitle')}</div>
            <div className="panel-window__meta">{t('profile.windowMeta')}</div>
          </div>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4">
          <section className="panel-card p-6">
            <div className="panel-badge panel-badge--info mb-3 w-fit uppercase tracking-[0.16em]">
              <ShieldCheck size={11} />
              {t('profile.controlsBadge')}
            </div>
            <div className="text-[22px] font-bold tracking-[-0.03em] text-[var(--win-text)]">{t('profile.heroTitle')}</div>
            <p className="mt-2 max-w-[640px] text-[12px] leading-6 text-[var(--text-secondary)]">
              {t('profile.heroDescription')}
            </p>
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="panel-card p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="panel-avatar">
                  <Cloud className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[var(--win-text)]">{t('profile.cloudflareTitle')}</div>
                  <div className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                    {t('profile.cloudflareDescription')}
                  </div>
                </div>
              </div>

              {cfLoading ? (
                <div className="py-10 text-center text-[13px] text-[var(--text-secondary)]">{t('profile.loadingCloudflare')}</div>
              ) : cf?.configured ? (
                <div className="space-y-4">
                  <div className="panel-card flex items-center justify-between gap-3 px-4 py-3 shadow-none">
                    <div>
                      <div className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">{t('profile.connectionStatus')}</div>
                      <div className="mt-1 text-[14px] font-semibold text-[var(--win-text)]">{t('profile.accountConnected')}</div>
                    </div>
                    <span className={cfStatusBadge.cls}>
                      {cfStatusBadge.icon}
                      {t(cfStatusBadge.labelKey)}
                    </span>
                  </div>

                  <div className="panel-muted-block space-y-2 rounded-[16px] p-4">
                    {[
                      { label: t('profile.accountId'), value: cf.accountId },
                      // { label: t('profile.zoneId'), value: cf.zoneId },
                      // { label: t('profile.baseDomain'), value: cf.baseDomain },
                      cf.verifiedAt ? { label: t('profile.verifiedAt'), value: new Date(cf.verifiedAt).toLocaleString('id-ID') } : null,
                    ].filter(Boolean).map((item) => (
                      <div key={item!.label} className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
                        <span className="text-[var(--text-secondary)]">{item!.label}</span>
                        <span className="panel-mono text-[var(--win-text)]">{item!.value || '—'}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => verifyMut.mutate()}
                      disabled={verifyMut.isPending}
                      className="panel-btn panel-btn--primary-soft flex-1"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {verifyMut.isPending ? t('profile.verifying') : t('profile.verifyToken')}
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = await alertLib.confirm(
                          t('profile.deleteConfirmTitle'),
                          t('profile.deleteConfirmMessage'),
                          t('profile.deleteConfirmAction'),
                          t('common.cancel'),
                          'warning',
                          'profile',
                        )
                        if (confirmed) deleteCFMut.mutate()
                      }}
                      className="panel-icon-btn panel-icon-btn--danger h-[42px] w-[42px] rounded-[14px] border border-[var(--win-border)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="panel-section-label">{t('profile.apiTokenRequired')}</label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder={t('profile.apiTokenPlaceholder')}
                        value={cfForm.apiToken}
                        onChange={(e) => setCfForm((f) => ({ ...f, apiToken: e.target.value }))}
                        className="panel-input panel-input--mono pr-10"
                      />
                      <button type="button" onClick={() => setShowToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] transition hover:text-[var(--win-text)]">
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {[
                    { key: 'accountId', label: t('profile.accountIdRequired'), placeholder: 'abc123...' },
                    { key: 'zoneId', label: t('profile.zoneIdOptional'), placeholder: t('profile.zoneIdPlaceholder') },
                    { key: 'baseDomain', label: t('profile.baseDomainOptional'), placeholder: 'example.com' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="panel-section-label">{label}</label>
                      <input
                        value={(cfForm as any)[key]}
                        onChange={(e) => setCfForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="panel-input panel-input--mono"
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => saveCFMut.mutate(cfForm)}
                    disabled={saveCFMut.isPending || !cfForm.apiToken || !cfForm.accountId}
                    className="panel-btn panel-btn--primary w-full"
                  >
                    {saveCFMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                    {saveCFMut.isPending ? t('profile.saving') : t('profile.saveAndConnect')}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="panel-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  <div className="panel-avatar">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--win-text)]">{t('profile.tokenSecurityTitle')}</div>
                    <div className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{t('profile.tokenSecurityMeta')}</div>
                  </div>
                </div>
                <div className="panel-muted-block rounded-[16px] px-4 py-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                  {t('profile.tokenSecurityDescription')}
                </div>
              </div>

              <div className="panel-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  <div className="panel-avatar">
                    <Globe2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--win-text)]">{t('profile.relatedWindowsTitle')}</div>
                    <div className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{t('profile.relatedWindowsMeta')}</div>
                  </div>
                </div>
                <ul className="space-y-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                  <li className="panel-muted-block rounded-[14px] px-4 py-3">{t('profile.relatedTunnelsReadStatus')}</li>
                  <li className="panel-muted-block rounded-[14px] px-4 py-3">{t('profile.relatedTunnelDisabled')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




