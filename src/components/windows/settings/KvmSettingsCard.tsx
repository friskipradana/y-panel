import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Download, ExternalLink, Monitor, Play, RefreshCw, Square, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { getSiteSettings, setSiteSettings, type SiteSettings } from '@/api/system'
import { getKvmStatus, installKvm, startKvm, stopKvm } from '@/api/kvm'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'
import { useWindowStore } from '@/store/windowStore'

export function KvmSettingsCard({ bare = false }: { bare?: boolean } = {}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const openWindow = useWindowStore((s) => s.openWindow)
  const [copied, setCopied] = useState(false)
  const [showManualCmd, setShowManualCmd] = useState(false)

  const siteQuery = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  const kvmQuery = useQuery({ queryKey: ['kvm-status'], queryFn: getKvmStatus, retry: 1, refetchInterval: 10_000 })

  const mutation = useMutation({
    mutationFn: (patch: Partial<SiteSettings>) => setSiteSettings(patch),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'site'], data)
      void qc.invalidateQueries({ queryKey: ['kvm-status'] })
      toast.success(t('settings.site.saved'))
    },
    onError: () => toast.error(t('settings.site.failed')),
  })

  const installMutation = useMutation({
    mutationFn: installKvm,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['kvm-status'] })
      toast.success(data?.message || t('kvm.installedSuccess'))
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal memasang x11vnc'),
  })

  const startMutation = useMutation({
    mutationFn: startKvm,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['kvm-status'] })
      toast.success(data?.message || t('kvm.serviceStarted'))
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal memulai layanan VNC'),
  })

  const stopMutation = useMutation({
    mutationFn: stopKvm,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kvm-status'] })
      toast.success(t('kvm.serviceStopped'))
    },
    onError: () => toast.error('Gagal menghentikan layanan VNC'),
  })

  const data = siteQuery.data
  const busy = !data || mutation.isPending
  const kvmEnabled = data?.kvmEnabled ?? false
  const kvmPort = data?.kvmPort ?? 5900
  const kvmDisplay = data?.kvmDisplay ?? ':0'

  const isInstalled = kvmQuery.data?.installed ?? true
  const isAvailable = kvmQuery.data?.available ?? false

  const copyCommand = (cmd: string) => {
    void navigator.clipboard.writeText(cmd)
    setCopied(true)
    toast.success(t('kvm.cmdCopied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const exampleCommand = `x11vnc -display ${kvmDisplay} -rfbport ${kvmPort} -shared -forever`

  return (
    <div className={bare ? 'flex flex-col gap-2.5' : 'panel-shell-card settings-card !p-3.5 !gap-2.5'}>
      {!bare ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
            <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('settings.kvm.title')}</h2>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">{t('settings.kvm.subtitle')}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 pt-1">
        <SettingRow
          title={t('settings.kvm.enable')}
          description={t('settings.kvm.subtitle')}
          icon={<Monitor className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} />}
          control={
            <ToggleSwitch
              checked={kvmEnabled}
              disabled={busy}
              label={t('settings.kvm.enable')}
              onChange={() => mutation.mutate({ kvmEnabled: !kvmEnabled })}
            />
          }
        />

        {kvmEnabled ? (
          <div className="flex flex-col gap-3 p-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-card-bg)] text-xs">
            {/* ── Status header & actions ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--panel-border)]">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    !isInstalled
                      ? 'bg-[var(--panel-warning-text)]'
                      : isAvailable
                      ? 'bg-[var(--status-online)]'
                      : 'bg-[var(--status-offline)]'
                  }`}
                />
                <span className="font-medium text-[var(--win-text)]">
                  {!isInstalled
                    ? t('kvm.notInstalledTitle')
                    : isAvailable
                    ? t('settings.kvm.available', { port: kvmPort })
                    : t('settings.kvm.unavailable', { port: kvmPort })}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {!isInstalled ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Download className="h-3 w-3" />}
                    loading={installMutation.isPending}
                    disabled={installMutation.isPending}
                    onClick={() => installMutation.mutate()}
                  >
                    {installMutation.isPending ? t('kvm.installing') : t('kvm.installBtn')}
                  </Button>
                ) : isAvailable ? (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Monitor className="h-3 w-3" />}
                      onClick={() => openWindow('kvm')}
                    >
                      {t('settings.kvm.openWindow')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<ExternalLink className="h-3 w-3" />}
                      onClick={() => window.open('/kvm', '_blank')}
                    >
                      {t('settings.kvm.openInNewTab')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Square className="h-3 w-3 text-[var(--panel-danger-text)]" />}
                      loading={stopMutation.isPending}
                      disabled={stopMutation.isPending}
                      onClick={() => stopMutation.mutate()}
                    >
                      {t('kvm.stopService')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Play className="h-3 w-3" />}
                      loading={startMutation.isPending}
                      disabled={startMutation.isPending}
                      onClick={() => startMutation.mutate()}
                    >
                      {startMutation.isPending ? t('kvm.startingService') : t('kvm.startService')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<RefreshCw className={`h-3 w-3 ${kvmQuery.isFetching ? 'animate-spin' : ''}`} />}
                      disabled={kvmQuery.isFetching}
                      onClick={() => void kvmQuery.refetch()}
                    >
                      {t('kvm.retry')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* ── Parameters (Port & Display) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {t('settings.kvm.port')}
                </label>
                <TextInput
                  type="number"
                  mono
                  value={String(kvmPort)}
                  disabled={busy}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val) && val > 0 && val <= 65535) {
                      mutation.mutate({ kvmPort: val })
                    }
                  }}
                  className="!h-8 px-2.5 text-[12px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {t('settings.kvm.display')}
                </label>
                <TextInput
                  mono
                  value={kvmDisplay}
                  disabled={busy}
                  onChange={(e) => {
                    mutation.mutate({ kvmDisplay: e.target.value.trim() || ':0' })
                  }}
                  className="!h-8 px-2.5 text-[12px]"
                  placeholder=":0"
                />
              </div>
            </div>

            {/* ── Help / Installation notice ── */}
            {!isInstalled ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded border border-[var(--panel-warning-border)] bg-[var(--panel-warning-bg)] text-[11px] text-[var(--panel-warning-text)]">
                <span>{t('kvm.notInstalledDesc')}</span>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Download className="h-3 w-3" />}
                  loading={installMutation.isPending}
                  disabled={installMutation.isPending}
                  onClick={() => installMutation.mutate()}
                >
                  {installMutation.isPending ? t('kvm.installing') : t('kvm.installBtn')}
                </Button>
              </div>
            ) : null}

            {/* ── Manual Command toggle for terminal users ── */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowManualCmd(!showManualCmd)}
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--win-text)] underline cursor-pointer"
              >
                {showManualCmd ? 'Sembunyikan perintah terminal manual' : 'Tampilkan perintah terminal manual'}
              </button>

              {showManualCmd ? (
                <div className="flex flex-col gap-1.5 mt-2 p-2 rounded border border-[var(--panel-border)] bg-[var(--panel-bg)]">
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-[var(--win-text)]">
                    <span className="truncate select-all">{exampleCommand}</span>
                    <IconButton
                      label={t('kvm.copyCmd')}
                      onClick={() => copyCommand(exampleCommand)}
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-[var(--panel-success-text)]" /> : <Copy className="h-3.5 w-3.5" />}
                    </IconButton>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Terminal className="h-3 w-3" />}
                      onClick={() => openWindow('host-terminal')}
                    >
                      {t('kvm.openTerminal')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
