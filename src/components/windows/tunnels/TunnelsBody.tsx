import { Globe2, Network } from 'lucide-react'
import { alertLib } from '@/lib/alert'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { DnsRow, RouteRow } from './TunnelRows'
import { TunnelsScope } from './TunnelsScope'
import { STATUS_CONFIG } from './tunnelForms'
import type { TunnelsWindowState } from './useTunnelsWindow'

// The domains tab lists the DNS records of one domain; the tunnels tab lists the routes of one profile
export function TunnelsBody({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    tab,
    cfNotConfigured,
    safeDomains,
    safeProfiles,
    lists,
    dnsData,
    routesData,
    selectedDomainId,
    selectedProfileId,
    domainsLoading,
    profilesLoading,
    dnsLoading,
    routesLoading,
    domainsError,
    profilesError,
    dnsError,
    routesError,
    filteredDns,
    filteredRoutes,
    deleteDnsMut,
    deleteTunnelMut,
    syncMut,
    openDnsModal,
    openTunnelModal,
    handleSync,
  } = tw

  if (cfNotConfigured) return null

  if (tab === 'domains') {
    const loading = domainsLoading || (!!selectedDomainId && dnsLoading)
    const noDomain = !domainsLoading && safeDomains.length === 0
    const narrowed = !!lists.dns.query.q || Object.keys(lists.dns.filters).length > 0
    const facets = dnsData?.facets
    const emptyTitle = noDomain ? t('tunnels.emptyDomains') : narrowed ? t('docker.noResults') : t('tunnels.emptyDns')
    return (
      <>
        <TunnelsScope tw={tw} />
        <ListTable
          variant="dns"
          empty={loading || domainsError || dnsError || filteredDns.length === 0}
          columns={[
            { label: t('docker.colIndex') },
            lists.dns.column('name', t('tunnels.col.record'), facets?.name),
            lists.dns.column('content', t('tunnels.col.content'), facets?.content),
            lists.dns.column('proxy', t('tunnels.col.proxy'), facets?.proxy, { labelOf: (v) => (v === 'proxied' ? t('tunnels.proxied') : t('tunnels.dnsOnly')) }),
            { label: t('tunnels.col.actions'), actions: true },
          ]}
        >
          <ListState
            loading={loading}
            error={domainsError || dnsError}
            errorTitle={t('tunnels.loadFailed')}
            errorHint={t('tunnels.loadFailedHint')}
            loadingText={t('tunnels.loadingData')}
            empty={filteredDns.length === 0}
            emptyIcon={<Globe2 />}
            emptyTitle={emptyTitle}
            emptyHint={noDomain ? t('tunnels.emptyDomainsHint') : undefined}
          >
            {filteredDns.map((record, index) => (
              <DnsRow
                key={record.id}
                record={record}
                index={index}
                onEdit={() => openDnsModal(record)}
                deleting={deleteDnsMut.isPending && deleteDnsMut.variables === record.id}
                onDelete={async () => {
                  if (await alertLib.confirm(t('tunnels.deleteDnsQuestion'), t('tunnels.deleteDnsMessage', { name: record.name }), t('common.delete'), t('common.cancel'), 'warning', 'tunnels')) deleteDnsMut.mutate(record.id)
                }}
              />
            ))}
            {narrowed && filteredDns.length > 0 ? <p className="docker-list-note">{t('tunnels.recordsSummary', { filtered: filteredDns.length, total: dnsData?.all ?? 0 })}</p> : null}
          </ListState>
        </ListTable>
      </>
    )
  }

  const loading = profilesLoading || (!!selectedProfileId && routesLoading)
  const noProfile = !profilesLoading && safeProfiles.length === 0
  const routesNarrowed = !!lists.routes.query.q || Object.keys(lists.routes.filters).length > 0
  const routeFacets = routesData?.facets
  const emptyTitle = noProfile ? t('tunnels.emptyProfiles') : routesNarrowed ? t('docker.noResults') : t('tunnels.emptyRoutes')
  return (
    <>
      <TunnelsScope tw={tw} />
      <ListTable
        variant="routes"
        empty={loading || profilesError || routesError || filteredRoutes.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          lists.routes.column('name', t('tunnels.col.route'), routeFacets?.name),
          lists.routes.column('target', t('tunnels.col.target'), routeFacets?.target),
          lists.routes.column('status', t('tunnels.col.status'), routeFacets?.status, { labelOf: (v) => t(STATUS_CONFIG[v]?.labelKey ?? 'tunnels.status.unknown') }),
          { label: t('tunnels.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={loading}
          error={profilesError || routesError}
          errorTitle={t('tunnels.loadFailed')}
          errorHint={t('tunnels.loadFailedHint')}
          loadingText={t('tunnels.loadingDetail')}
          empty={filteredRoutes.length === 0}
          emptyIcon={<Network />}
          emptyTitle={emptyTitle}
          emptyHint={noProfile ? t('tunnels.emptyProfilesHint') : undefined}
        >
          {filteredRoutes.map((route, index) => (
            <RouteRow
              key={route.id}
              route={route}
              index={index}
              onEdit={() => openTunnelModal(route)}
              onSync={() => handleSync(route)}
              syncing={syncMut.isPending && syncMut.variables?.id === route.id}
              deleting={deleteTunnelMut.isPending && deleteTunnelMut.variables === route.id}
              onDelete={async () => {
                if (await alertLib.confirm(t('tunnels.deleteRouteQuestion'), t('tunnels.deleteRouteMessage', { name: route.name }), t('common.delete'), t('common.cancel'), 'warning', 'tunnels')) deleteTunnelMut.mutate(route.id)
              }}
            />
          ))}
          {routesNarrowed && filteredRoutes.length > 0 ? <p className="docker-list-note">{t('tunnels.routesSummary', { filtered: filteredRoutes.length, total: routesData?.all ?? 0 })}</p> : null}
        </ListState>
      </ListTable>
    </>
  )
}
