import { useMemo } from 'react'
import { Boxes, RefreshCw, Search, Trash2, Wifi } from 'lucide-react'
import type { DockerNetwork } from '@/types'
import { useI18n } from '@/lib/i18n'

interface NetworksTabProps {
  networks: DockerNetwork[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  search: string
  setSearch: (v: string) => void
  query: string
  setQuery: (v: string) => void
  deleteNetworkMutation: any
}

export function NetworksTab({
  networks,
  isLoading,
  isError,
  error,
  search,
  setSearch,
  query,
  setQuery,
  deleteNetworkMutation,
}: NetworksTabProps) {
  const { t } = useI18n()
  const filteredNetworks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return networks
    return networks.filter((network) => {
      return [network.Name, network.Driver, network.Scope, network.Id, network.Subnet, network.Gateway].some(
        (value) => value?.toLowerCase().includes(needle)
      )
    })
  }, [networks, search])

  return (
    <div className="panel-window__stack">
      <div className="panel-table-container">
        <div className="panel-toolbar panel-toolbar--search docker-toolbar-card">
          <form
            className="panel-search"
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(query.trim())
            }}
          >
            <Search className="h-4 w-4" />
            <input
              id="docker-networks-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="panel-search__input"
              placeholder={t('docker.searchNetworks')}
            />
            <button type="submit" className="panel-btn panel-btn--primary-soft">{t('docker.search')}</button>
          </form>
        </div>

        {isLoading ? (
          <div className="panel-loading">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('docker.loadingNetworks')}
          </div>
        ) : isError ? (
          <div className="panel-error-state">
            <Wifi className="h-5 w-5" />
            <div>
              <p className="font-semibold">{t('docker.networksLoadFailed')}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.runtimeAccessHint')}</p>
            </div>
          </div>
        ) : filteredNetworks.length === 0 ? (
          <div className="panel-empty panel-empty--wide">
            <Boxes className="h-8 w-8" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--win-text)]">{t('docker.noNetworksMatch')}</div>
              <div>{t('docker.emptyNetworksHint')}</div>
            </div>
          </div>
        ) : (
          <>
            {filteredNetworks.map((network) => {
              const driver = network.Driver || '-'
              const scope = network.Scope || '-'
              const subnet = network.Subnet || '-'
              const gateway = network.Gateway || '-'
              const isBuiltIn = ['none', 'host', 'bridge'].includes(network.Name)

              return (
                <div key={network.Id} className="panel-table-row">
                  <div className="docker-network-row__main">
                    <div className="docker-container-row__header">
                      <div className="docker-container-card__title-wrap">
                        <div className="docker-container-card__title-row">
                          <span className="docker-container-card__title">{network.Name}</span>
                          <span className="docker-inline-code">{t('docker.driver')} {driver}</span>
                          <span className="docker-inline-code">{t('docker.scope')} {scope}</span>
                        </div>
                        <div className="docker-container-card__meta-row">
                          <span className="docker-inline-code">ID {network.Id.slice(0, 12)}</span>
                          <span className="docker-inline-dot" />
                          <span className="docker-inline-code">{t('docker.subnet')} {subnet}</span>
                          <span className="docker-inline-dot" />
                          <span className="docker-inline-code">{t('docker.gateway')} {gateway}</span>
                          {network.OwnerName && (
                            <>
                              <span className="docker-inline-dot" />
                              <span className="docker-inline-code">{t('docker.owner')}: {network.OwnerName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="docker-container-row__actions">
                        <button
                          type="button"
                          className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                          onClick={() => deleteNetworkMutation.mutate(network.Id)}
                          disabled={isBuiltIn || deleteNetworkMutation.isPending}
                          title={isBuiltIn ? t('docker.builtinNetworkDeleteDisabled') : t('docker.deleteNetwork')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}




