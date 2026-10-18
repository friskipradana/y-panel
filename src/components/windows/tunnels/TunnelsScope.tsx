import { Copy, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { alertLib } from '@/lib/alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { STATUS_CONFIG } from './tunnelForms'
import type { TunnelsWindowState } from './useTunnelsWindow'

const SEARCH_FROM = 8

// What the list below belongs to: the domain whose DNS records it shows, or the tunnel profile whose routes
export function TunnelsScope({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    tab,
    cfNotConfigured,
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
    openDnsModal,
    openTunnelModal,
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
              <Button variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={checking} onClick={() => checkCreatedDomainMut.mutate(selectedDomain.id)}>
                {checking ? t('tunnels.checking') : t('tunnels.checkStatus')}
              </Button>
              <IconButton tone="danger" label={t('tunnels.deleteDomainTitle')} disabled={deleting} onClick={() => void askDeleteDomain()}>
                {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </IconButton>
            </>
          ) : null}
          </div>
          <Button className="ml-auto" variant="primary-soft" icon={<Plus className="h-3.5 w-3.5" />} disabled={cfNotConfigured || !selectedDomainId} onClick={() => openDnsModal()}>
            {t('tunnels.createDns')}
          </Button>
        </div>
        {selectedDomain && nameServers.length > 0 ? (
          <div className="cloudflare-scope__meta">
            <span>{selectedDomain.status === 'active' ? t('tunnels.nameservers') : t('tunnels.domainPendingCopy')}</span>
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
                <Copy className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
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
          value={selectedProfileId}
          onChange={setSelectedProfileId}
          options={safeProfiles.map((profile) => ({ value: profile.id, label: profile.name || profile.id }))}
          searchable={safeProfiles.length > SEARCH_FROM}
          placeholder={t('tunnels.pickProfile')}
        />
        <Button className="ml-auto" variant="primary-soft" icon={<Plus className="h-3.5 w-3.5" />} disabled={cfNotConfigured || !selectedProfileId} onClick={() => openTunnelModal()}>
          {t('tunnels.createRoute')}
        </Button>
      </div>
      {selectedProfile && status ? (
        <div className="cloudflare-scope__meta">
          <Badge tone={status.tone} dot>{t(status.labelKey)}</Badge>
          <span>{selectedProfile.routeCount === 1 ? t('tunnels.routeCount', { count: selectedProfile.routeCount }) : t('tunnels.routesCount', { count: selectedProfile.routeCount })}</span>
          <span>{selectedProfile.daemonRunning ? t('tunnels.daemonRunning') : t('tunnels.daemonIdle')}</span>
          <span className="panel-mono" title={selectedProfile.id}>ID {selectedProfile.id.slice(0, 8)}...</span>
          <IconButton
            className="ml-auto"
            tone="danger"
            label={t('tunnels.deleteProfileTitle')}
            disabled={deleteProfileMut.isPending || selectedProfile.id === 'pending'}
            onClick={() => void askDeleteProfile()}
          >
            {deleteProfileMut.isPending && deleteProfileMut.variables === selectedProfile.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </IconButton>
        </div>
      ) : null}
    </div>
  )
}
