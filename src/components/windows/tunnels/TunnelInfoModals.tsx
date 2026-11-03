import { type CloudflareDomain, type CloudflareTunnelProfile } from '@/api/agent'
import { toast } from 'sonner'
import { Copy, Globe2, Network, RefreshCw } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { STATUS_CONFIG } from './tunnelForms'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export function DomainInfoModal({
  domain,
  onClose,
  onCheckStatus,
  checkingStatus,
}: {
  domain: CloudflareDomain
  onClose: () => void
  onCheckStatus?: () => void
  checkingStatus?: boolean
}) {
  const { t } = useI18n()
  const status = STATUS_CONFIG[domain.status ?? 'pending'] ?? STATUS_CONFIG.pending
  const nameServers = domain.name_servers ?? []

  return (
    <Modal
      open
      onClose={onClose}
      title={domain.name}
      subtitle={t('tunnels.zoneTitle')}
      icon={<Globe2 />}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          {onCheckStatus && domain.status !== 'active' ? (
            <Button type="button" variant="primary" size="sm" onClick={onCheckStatus} disabled={checkingStatus}>
              <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
              {checkingStatus ? t('tunnels.checking') : t('tunnels.checkStatus')}
            </Button>
          ) : <div />}
          <Button onClick={onClose} variant="ghost" size="sm">{t('common.close')}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)] overflow-hidden text-[12px]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)] font-medium">{t('common.status')}</span>
            <span className={`docker-status-pill docker-status-pill--${domain.status === 'active' ? 'running' : 'paused'}`}>
              <span className="docker-status-dot" />
              <span>{t(status.labelKey)}</span>
            </span>
          </div>

          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)] font-medium">Zone ID</span>
            <div className="flex items-center gap-1.5">
              <span className="panel-mono text-[11px] text-[var(--win-text)] select-all">{domain.id}</span>
              <button
                type="button"
                className="docker-act-btn w-6 h-6 min-h-0 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
                title={t('tunnels.copy')}
                aria-label={t('tunnels.copy')}
                onClick={() => {
                  navigator.clipboard.writeText(domain.id).then(() => {
                    toast.success(`Zone ID tersalin: ${domain.id}`)
                  })
                }}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {nameServers.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                {t('tunnels.requiredNameservers')}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--panel-primary-text)] hover:underline cursor-pointer"
                onClick={() =>
                  navigator.clipboard
                    .writeText(nameServers.join('\n'))
                    .then(() => toast.success(t('tunnels.allNameserversCopied')))
                }
              >
                <Copy className="h-3 w-3" />
                <span>{t('tunnels.copyAllNameservers')}</span>
              </button>
            </div>

            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)] overflow-hidden">
              {nameServers.map((ns, idx) => (
                <div key={ns} className="flex items-center justify-between px-3 py-2 text-[12px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="panel-mono text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--win-bar)] px-1.5 py-0.5 rounded border border-[var(--win-border)]">
                      NS{idx + 1}
                    </span>
                    <span className="panel-mono text-[12px] text-[var(--win-text)] truncate select-all">{ns}</span>
                  </div>
                  <button
                    type="button"
                    className="docker-act-btn w-6 h-6 min-h-0 shrink-0 ml-2 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
                    title={t('tunnels.copy')}
                    aria-label={t('tunnels.copy')}
                    onClick={() =>
                      navigator.clipboard.writeText(ns).then(() =>
                        toast.success(t('tunnels.nameserverCopied', { name: ns }))
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {domain.status !== 'active' ? (
          <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed px-1">
            {t('tunnels.domainPropagationNote')}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

export function ProfileInfoModal({ profile, onClose }: { profile: CloudflareTunnelProfile; onClose: () => void }) {
  const { t } = useI18n()
  const status = STATUS_CONFIG[profile.status] ?? STATUS_CONFIG.pending
  const title = profile.name || String(profile.id)

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={t('tunnels.profileTitle')}
      icon={<Network />}
      size="md"
      footer={<Button onClick={onClose} variant="ghost" size="sm">{t('common.close')}</Button>}
    >
      <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)] overflow-hidden text-[12px]">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">{t('common.status')}</span>
          <span className={`docker-status-pill docker-status-pill--${status.tone === 'success' ? 'running' : 'paused'}`}>
            <span className="docker-status-dot" />
            <span>{t(status.labelKey)}</span>
          </span>
        </div>

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">Tunnel ID</span>
          <div className="flex items-center gap-1.5">
            <span className="panel-mono text-[11px] text-[var(--win-text)] select-all">{profile.id}</span>
            <button
              type="button"
              className="docker-act-btn w-6 h-6 min-h-0 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
              title={t('tunnels.copy')}
              aria-label={t('tunnels.copy')}
              onClick={() => {
                navigator.clipboard.writeText(String(profile.id)).then(() => {
                  toast.success(`Tunnel ID tersalin: ${profile.id}`)
                })
              }}
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">Daemon</span>
          <span className="panel-mono text-[11.5px] text-[var(--win-text)]">
            {profile.daemonRunning ? t('tunnels.daemonRunning') : t('tunnels.daemonIdle')}
          </span>
        </div>

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">{t('tunnels.routesTitle')}</span>
          <span className="panel-mono text-[11.5px] text-[var(--win-text)] font-semibold">{profile.routeCount ?? 0}</span>
        </div>
      </div>
    </Modal>
  )
}

