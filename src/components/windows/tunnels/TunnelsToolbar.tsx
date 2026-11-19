import { KeyRound, Plus, RefreshCw, Search } from 'lucide-react'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { openCloudflareSettings, useCanOpenCloudflareSettings } from './openCloudflareSettings'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import type { TunnelsWindowState } from './useTunnelsWindow'

// The bar of the Cloudflare / Tunnels window: which list, its main action, search, refresh, and whether the token works
export function TunnelsToolbar({ tw }: { tw: TunnelsWindowState }) {
  const isMobile = useIsMobileLayout()
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
    securityQuery,
    securitySearch,
    setSecuritySearch,
    setShowWafRuleModal,
  } = tw

  const canOpenSettings = useCanOpenCloudflareSettings()
  const onDomains = tab === 'domains'
  const onSecurity = tab === 'security'
  const tabItems = [
    { key: 'domains', label: t('tunnels.domainTab'), count: safeDomains.length },
    { key: 'tunnels', label: t('tunnels.tunnelsTab'), count: safeProfiles.length },
    { key: 'security', label: t('tunnels.securityTab') },
  ]
  const current = onDomains ? lists.dns : lists.routes
  const searchValue = onSecurity ? securitySearch : current.text
  const setSearchValue = onSecurity ? setSecuritySearch : current.setText
  const searchPlaceholder = onSecurity ? t('tunnels.searchWaf') : onDomains ? t('tunnels.searchDns') : t('tunnels.searchRoute')
  const fetching = onSecurity ? securityQuery.isFetching : onDomains ? domainsFetching : profilesFetching
  const wafLocked = !!securityQuery.data?.wafPermissionError
  const onRefresh = () => {
    if (onSecurity) void securityQuery.refetch()
    else if (onDomains) void refetchDomains()
    else void refetchProfiles()
  }

  if (isMobile) {
    return (
      <div className="docker-topbar docker-topbar--mobile">
        <div className="docker-topbar__mobile-row">
          <FilterMenu
            label={t('tunnels.tabs')}
            value={tab}
            onChange={(key) => setTab(key as 'domains' | 'tunnels' | 'security')}
            items={tabItems}
          />
          {!onSecurity ? (
            <button
              type="button"
              className="docker-dropdown-btn"
              disabled={cfNotConfigured}
              onClick={() => (onDomains ? setShowDomainModal(true) : setShowProfileModal(true))}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{onDomains ? t('tunnels.addDomain') : t('tunnels.createProfile')}</span>
            </button>
          ) : null}

          <button
            type="button"
            className="docker-primary-btn"
            disabled={
              cfNotConfigured ||
              (onSecurity ? !selectedDomainId || wafLocked : onDomains ? !selectedDomainId : !selectedProfileId)
            }
            onClick={() => (onSecurity ? setShowWafRuleModal(true) : onDomains ? openDnsModal() : openTunnelModal())}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{onSecurity ? t('tunnels.createWafRule') : onDomains ? t('tunnels.createDns') : t('tunnels.createRoute')}</span>
          </button>
        </div>

        <div className="docker-topbar__mobile-search">
          <div className="docker-search-wrap docker-search-wrap--mobile">
            <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
            <input
              id="cloudflare-search-input"
              type="search"
              className="docker-search-input docker-search-input--mobile"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="docker-icon-btn docker-icon-btn--mobile"
            title={t('tunnels.refresh')}
            aria-label={t('tunnels.refresh')}
            disabled={cfNotConfigured}
            onClick={onRefresh}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            className={`docker-icon-btn docker-icon-btn--mobile ${cfNotConfigured ? 'docker-icon-btn--muted' : 'docker-icon-btn--success'} shrink-0`}
            title={cfNotConfigured ? t('tunnels.notConfigured') : t('tunnels.tokenActive')}
            aria-label={t('tunnels.openCloudflareSettings')}
            disabled={!canOpenSettings}
            onClick={openCloudflareSettings}
          >
            <KeyRound className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left">
        <FilterMenu
          label={t('tunnels.tabs')}
          value={tab}
          onChange={(key) => setTab(key as 'domains' | 'tunnels' | 'security')}
          items={tabItems}
        />
        {!onSecurity ? (
          <button
            type="button"
            className="docker-dropdown-btn"
            disabled={cfNotConfigured}
            onClick={() => (onDomains ? setShowDomainModal(true) : setShowProfileModal(true))}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{onDomains ? t('tunnels.addDomain') : t('tunnels.createProfile')}</span>
          </button>
        ) : null}

        <button
          type="button"
          className="docker-primary-btn"
          disabled={
            cfNotConfigured ||
            (onSecurity ? !selectedDomainId || wafLocked : onDomains ? !selectedDomainId : !selectedProfileId)
          }
          onClick={() => (onSecurity ? setShowWafRuleModal(true) : onDomains ? openDnsModal() : openTunnelModal())}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>{onSecurity ? t('tunnels.createWafRule') : onDomains ? t('tunnels.createDns') : t('tunnels.createRoute')}</span>
        </button>
      </div>

      <div className="docker-topbar__right">
        <div className="docker-search-wrap">
          <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
          <input
            id="cloudflare-search-input"
            type="search"
            className="docker-search-input"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="docker-icon-btn"
          title={t('tunnels.refresh')}
          aria-label={t('tunnels.refresh')}
          disabled={cfNotConfigured}
          onClick={onRefresh}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          className={`docker-icon-btn ${cfNotConfigured ? 'docker-icon-btn--muted' : 'docker-icon-btn--success'} shrink-0`}
          title={cfNotConfigured ? t('tunnels.notConfigured') : t('tunnels.tokenActive')}
          aria-label={t('tunnels.openCloudflareSettings')}
          disabled={!canOpenSettings}
          onClick={openCloudflareSettings}
        >
          <KeyRound className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
