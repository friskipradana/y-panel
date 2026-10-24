import { KeyRound, Plus, RefreshCw, Search } from 'lucide-react'
import { FilterMenu } from '@/components/ui/FilterMenu'
import type { TunnelsWindowState } from './useTunnelsWindow'

// The bar of the Docker window: which list, its main action, search, refresh, and whether the token works
export function TunnelsToolbar({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    tab,
    setTab,
    safeDomains,
    safeProfiles,
    cfNotConfigured,
    setShowDomainModal,
    setShowProfileModal,
    openDnsModal,
    openTunnelModal,
    selectedDomainId,
    selectedProfileId,
    lists,
    refetchDomains,
    domainsFetching,
    refetchProfiles,
    profilesFetching,
  } = tw

  const onDomains = tab === 'domains'
  const current = onDomains ? lists.dns : lists.routes
  const fetching = onDomains ? domainsFetching : profilesFetching

  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left">
        <FilterMenu
          label={t('tunnels.tabs')}
          value={tab}
          onChange={(key) => setTab(key as 'domains' | 'tunnels')}
          items={[
            { key: 'domains', label: t('tunnels.domainTab'), count: safeDomains.length },
            { key: 'tunnels', label: t('tunnels.tunnelsTab'), count: safeProfiles.length },
          ]}
        />
        <button
          type="button"
          className="docker-dropdown-btn"
          disabled={cfNotConfigured}
          onClick={() => (onDomains ? setShowDomainModal(true) : setShowProfileModal(true))}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>{onDomains ? t('tunnels.addDomain') : t('tunnels.createProfile')}</span>
        </button>

        <button
          type="button"
          className="docker-primary-btn"
          disabled={cfNotConfigured || (onDomains ? !selectedDomainId : !selectedProfileId)}
          onClick={() => (onDomains ? openDnsModal() : openTunnelModal())}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>{onDomains ? t('tunnels.createDns') : t('tunnels.createRoute')}</span>
        </button>
      </div>

      <div className="docker-topbar__right">
        <div className="docker-search-wrap">
          <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
          <input
            id="cloudflare-search-input"
            type="search"
            className="docker-search-input"
            aria-label={onDomains ? t('tunnels.searchDns') : t('tunnels.searchRoute')}
            placeholder={onDomains ? t('tunnels.searchDns') : t('tunnels.searchRoute')}
            value={current.text}
            onChange={(e) => current.setText(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="docker-icon-btn"
          title={t('tunnels.refresh')}
          aria-label={t('tunnels.refresh')}
          disabled={cfNotConfigured}
          onClick={() => void (onDomains ? refetchDomains() : refetchProfiles())}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>

        <div
          className={`docker-icon-btn ${cfNotConfigured ? 'docker-icon-btn--muted' : 'docker-icon-btn--success'} cursor-help shrink-0`}
          title={cfNotConfigured ? t('tunnels.notConfigured') : t('tunnels.tokenActive')}
          aria-label={cfNotConfigured ? t('tunnels.notConfigured') : t('tunnels.tokenActive')}
        >
          <KeyRound className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  )
}
