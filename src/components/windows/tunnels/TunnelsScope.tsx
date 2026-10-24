import { Copy, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { alertLib } from '@/lib/alert'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { STATUS_CONFIG } from './tunnelForms'
import type { TunnelsWindowState } from './useTunnelsWindow'

const SEARCH_FROM = 8

// What the list below belongs to: the domain whose DNS records it shows, or the tunnel profile whose routes
export function TunnelsScope({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    tab,
    safeDomains,
    safeProfiles,
    selectedDomain,
    selectedDomainId,
    setSelectedDomainId,
    selectedProfile,
    selectedProfileId,
    setSelectedProfileId,
    checkCreatedDomainMut,
    deleteDomainMut,
    deleteProfileMut,
  } = tw

  if (tab === 'domains') {
    if (safeDomains.length === 0) return null
    const askDeleteDomain = async () => {
      if (!selectedDomain) return
      const confirmed = await alertLib.confirm(t('tunnels.deleteDomainQuestion'), t('tunnels.deleteDomainMessage', { name: selectedDomain.name }), t('tunnels.deleteDomain'), t('common.cancel'), 'warning', 'tunnels')
      if (confirmed) deleteDomainMut.mutate(selectedDomain.id)
    }
    const status = selectedDomain ? (STATUS_CONFIG[selectedDomain.status ?? 'pending'] ?? STATUS_CONFIG.pending) : null
    const checking = checkCreatedDomainMut.isPending
    const deleting = !!selectedDomain && deleteDomainMut.isPending && deleteDomainMut.variables === selectedDomain.id
    const nameServers = selectedDomain?.name_servers ?? []
    return (
      <div className="cloudflare-scope">
        <div className="cloudflare-scope__row">
          <Select
            className="cloudflare-scope__select"
            size="sm"
            value={selectedDomainId}
            onChange={setSelectedDomainId}
            options={safeDomains.map((domain) => ({ value: domain.id, label: domain.name, badge: domain.status }))}
            searchable={safeDomains.length > SEARCH_FROM}
            placeholder={t('tunnels.pickDomain')}
          />
          <div className="cloudflare-scope__state">
            {status ? <Badge tone={status.tone} dot>{t(status.labelKey)}</Badge> : null}
            {selectedDomain ? (
              <>
                <button
                  type="button"
                  className="docker-icon-btn"
                  title={checking ? t('tunnels.checking') : t('tunnels.checkStatus')}
                  aria-label={t('tunnels.checkStatus')}
                  disabled={checking}
                  onClick={() => checkCreatedDomainMut.mutate(selectedDomain.id)}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="docker-icon-btn hover:text-[var(--panel-danger-text)] hover:border-[var(--panel-danger-border)]"
                  title={t('tunnels.deleteDomainTitle')}
                  aria-label={t('tunnels.deleteDomainTitle')}
                  disabled={deleting}
                  onClick={() => void askDeleteDomain()}
                >
                  {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </button>
              </>
            ) : null}
          </div>

          {selectedDomain && nameServers.length > 0 ? (
            <div className="cloudflare-scope__meta ml-auto">
              <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">NS:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {nameServers.map((ns, index) => (
                  <button
                    key={ns}
                    type="button"
                    className="cloudflare-ns-chip"
                    title={t('tunnels.copy')}
                    onClick={() => navigator.clipboard.writeText(ns).then(() => toast.success(t('tunnels.nameserverCopied', { name: ns })))}
                  >
                    <span>NS{index + 1}</span>
                    <strong>{ns}</strong>
                    <Copy className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (safeProfiles.length === 0) return null
  const status = selectedProfile ? (STATUS_CONFIG[selectedProfile.status] ?? { tone: 'neutral' as const, labelKey: 'tunnels.status.unknown' }) : null
  const askDeleteProfile = async () => {
    if (!selectedProfile) return
    const confirmed = await alertLib.confirm(t('tunnels.deleteProfileQuestion'), t('tunnels.deleteProfileMessage', { name: selectedProfile.name }), t('tunnels.deleteProfile'), t('common.cancel'), 'warning', 'tunnels')
    if (confirmed) deleteProfileMut.mutate(selectedProfile.id)
  }
  return (
    <div className="cloudflare-scope">
      <div className="cloudflare-scope__row">
        <Select
          className="cloudflare-scope__select"
          size="sm"
          value={selectedProfileId}
          onChange={setSelectedProfileId}
          options={safeProfiles.map((profile) => ({ value: profile.id, label: profile.name || profile.id }))}
          searchable={safeProfiles.length > SEARCH_FROM}
          placeholder={t('tunnels.pickProfile')}
        />
        <div className="cloudflare-scope__state">
          {selectedProfile && status ? <Badge tone={status.tone} dot>{t(status.labelKey)}</Badge> : null}
          {selectedProfile ? (
            <button
              type="button"
              className="docker-icon-btn hover:text-[var(--panel-danger-text)] hover:border-[var(--panel-danger-border)]"
              title={t('tunnels.deleteProfileTitle')}
              aria-label={t('tunnels.deleteProfileTitle')}
              disabled={deleteProfileMut.isPending || selectedProfile.id === 'pending'}
              onClick={() => void askDeleteProfile()}
            >
              {deleteProfileMut.isPending && deleteProfileMut.variables === selectedProfile.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          ) : null}
        </div>

        {selectedProfile ? (
          <div className="cloudflare-scope__meta ml-auto">
            <span>{selectedProfile.routeCount === 1 ? t('tunnels.routeCount', { count: selectedProfile.routeCount }) : t('tunnels.routesCount', { count: selectedProfile.routeCount })}</span>
            <span className="opacity-30">&middot;</span>
            <span>{selectedProfile.daemonRunning ? t('tunnels.daemonRunning') : t('tunnels.daemonIdle')}</span>
            <span className="opacity-30">&middot;</span>
            <span className="panel-mono text-[11px]" title={selectedProfile.id}>ID {selectedProfile.id.slice(0, 8)}...</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
