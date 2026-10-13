import { Globe2, Network, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import type { TunnelsWindowState } from './useTunnelsWindow'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'

export function TunnelsToolbar({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    tab,
    setTab,
    selectedDomainId,
    selectedProfileId,
    setShowDomainModal,
    setShowProfileModal,
    cfNotConfigured,
    refetchDomains,
    domainsFetching,
    refetchProfiles,
    profilesFetching,
    safeDomains,
    safeProfiles,
    openDnsModal,
    openTunnelModal,
  } = tw

  return (
    <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
      <div className="flex items-center gap-1">
        <button
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
            tab === 'domains'
              ? 'bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--win-text)] hover:bg-[var(--tb-hover)]'
          }`}
          onClick={() => setTab('domains')}
        >
          <Globe2 className="h-3.5 w-3.5" /> {t('tunnels.domainTab')}
          <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px] font-mono">{safeDomains.length}</span>
        </button>
        <button
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
            tab === 'tunnels'
              ? 'bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--win-text)] hover:bg-[var(--tb-hover)]'
          }`}
          onClick={() => setTab('tunnels')}
        >
          <Network className="h-3.5 w-3.5" /> {t('tunnels.tunnelsTab')}
          <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px] font-mono">{safeProfiles.length}</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {!cfNotConfigured && (
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-[var(--panel-success-text)] font-medium mr-1">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('tunnels.tokenActive')}
          </div>
        )}
        <IconButton onClick={() => tab === 'domains' ? refetchDomains() : refetchProfiles()} label={t('tunnels.refresh')}>
          <RefreshCw className={`h-3.5 w-3.5 ${(domainsFetching || profilesFetching) ? 'animate-spin' : ''}`} />
        </IconButton>
        {tab === 'domains' ? (
          <>
            <Button onClick={() => setShowDomainModal(true)} disabled={cfNotConfigured} variant="primary-soft" className="text-xs py-1 px-2.5 disabled:cursor-not-allowed">
              <Plus className="h-3.5 w-3.5" /> {t('tunnels.addDomain')}
            </Button>
            <Button onClick={() => openDnsModal()} disabled={cfNotConfigured || !selectedDomainId} variant="primary" className="text-xs py-1 px-2.5 disabled:cursor-not-allowed">
              <Plus className="h-3.5 w-3.5" /> {t('tunnels.createDns')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setShowProfileModal(true)} disabled={cfNotConfigured} variant="primary-soft" className="text-xs py-1 px-2.5 disabled:cursor-not-allowed">
              <Plus className="h-3.5 w-3.5" /> {t('tunnels.createProfile')}
            </Button>
            <Button onClick={() => openTunnelModal()} disabled={cfNotConfigured || !selectedProfileId} variant="primary" className="text-xs py-1 px-2.5 disabled:cursor-not-allowed">
              <Plus className="h-3.5 w-3.5" /> {t('tunnels.createRoute')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
