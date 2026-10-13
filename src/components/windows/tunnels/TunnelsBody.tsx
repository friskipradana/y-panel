import { alertLib } from '@/lib/alert'
import { CloudflareSplit } from './TunnelsShared'
import { DomainRow, ProfileRow, DNSRow, TunnelCard } from './TunnelRows'
import { DomainStatusPanel } from './TunnelModals'
import type { TunnelsWindowState } from './useTunnelsWindow'

export function TunnelsBody({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    tab,
    selectedDomainId,
    setSelectedDomainId,
    selectedProfileId,
    setSelectedProfileId,
    domainSearch,
    setDomainSearch,
    dnsSearch,
    setDnsSearch,
    profileSearch,
    setProfileSearch,
    routeSearch,
    setRouteSearch,
    domainsLoading,
    dnsLoading,
    profilesLoading,
    routesLoading,
    safeDnsRecords,
    safeProfileRoutes,
    selectedDomain,
    selectedProfile,
    filteredDomains,
    filteredDns,
    filteredProfiles,
    filteredRoutes,
    checkCreatedDomainMut,
    deleteDnsMut,
    deleteDomainMut,
    deleteProfileMut,
    deleteTunnelMut,
    syncMut,
    openDnsModal,
    openTunnelModal,
    handleSync,
  } = tw

  return (
    <div className="panel-window__body cloudflare-window__body">
      {tab === 'domains' ? (
        <>
          <CloudflareSplit
            leftTitle={t('tunnels.domainTab')}
            leftSubtitle={t('tunnels.domainSubtitle')}
            rightTitle={selectedDomain ? selectedDomain.name : t('tunnels.dnsSetting')}
            rightSubtitle={t('tunnels.recordsSummary', { filtered: filteredDns.length, total: safeDnsRecords.length })}
            leftSearch={domainSearch}
            onLeftSearch={setDomainSearch}
            rightSearch={dnsSearch}
            onRightSearch={setDnsSearch}
            leftPlaceholder={t('tunnels.searchDomain')}
            rightPlaceholder={t('tunnels.searchDns')}
            leftLoading={domainsLoading}
            rightLoading={dnsLoading}
            emptyLeft={t('tunnels.emptyDomains')}
            emptyRight={t('tunnels.emptyDns')}
            leftItems={filteredDomains.map((d) => (
              <DomainRow
                key={d.id}
                domain={d}
                active={d.id === selectedDomainId}
                onClick={() => setSelectedDomainId(d.id)}
                onDelete={async () => {
                  if (await alertLib.confirm(t('tunnels.deleteDomainQuestion'), t('tunnels.deleteDomainMessage', { name: d.name }), t('tunnels.deleteDomain'), t('common.cancel'), 'warning', 'tunnels')) deleteDomainMut.mutate(d.id)
                }}
                deleting={deleteDomainMut.isPending && d.id === selectedDomainId}
              />
            ))}
            rightTopSlot={selectedDomain ? (
              <DomainStatusPanel
                domain={selectedDomain}
                onCheckStatus={() => checkCreatedDomainMut.mutate(selectedDomain.id)}
                checkingStatus={checkCreatedDomainMut.isPending && selectedDomain.id === selectedDomainId}
                onDelete={async () => {
                  if (await alertLib.confirm(t('tunnels.deleteDomainQuestion'), t('tunnels.deleteDomainMessage', { name: selectedDomain.name }), t('tunnels.deleteDomain'), t('common.cancel'), 'warning', 'tunnels')) deleteDomainMut.mutate(selectedDomain.id)
                }}
                deleting={deleteDomainMut.isPending && deleteDomainMut.variables === selectedDomain.id}
              />
            ) : null}
            rightItems={filteredDns.map((record) => (
              <DNSRow
                key={record.id}
                record={record}
                onEdit={() => openDnsModal(record)}
                onDelete={async () => {
                  if (await alertLib.confirm(t('tunnels.deleteDnsQuestion'), t('tunnels.deleteDnsMessage', { name: record.name }), t('common.delete'), t('common.cancel'), 'warning', 'tunnels')) deleteDnsMut.mutate(record.id)
                }}
              />
            ))}
          />
        </>
      ) : (
        <CloudflareSplit
          leftTitle={t('tunnels.profileTitle')}
          leftSubtitle={t('tunnels.profileSubtitle')}
          rightTitle={selectedProfile ? selectedProfile.name : t('tunnels.routesTitle')}
          rightSubtitle={t('tunnels.routesSummary', { filtered: filteredRoutes.length, total: safeProfileRoutes.length })}
          leftSearch={profileSearch}
          onLeftSearch={setProfileSearch}
          rightSearch={routeSearch}
          onRightSearch={setRouteSearch}
          leftPlaceholder={t('tunnels.searchProfile')}
          rightPlaceholder={t('tunnels.searchRoute')}
          leftLoading={profilesLoading}
          rightLoading={routesLoading}
          emptyLeft={t('tunnels.emptyProfiles')}
          emptyRight={t('tunnels.emptyRoutes')}
          leftItems={filteredProfiles.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              active={p.id === selectedProfileId}
              onClick={() => setSelectedProfileId(p.id)}
              onDelete={async () => {
                if (await alertLib.confirm(t('tunnels.deleteProfileQuestion'), t('tunnels.deleteProfileMessage', { name: p.name }), t('tunnels.deleteProfile'), t('common.cancel'), 'warning', 'tunnels')) deleteProfileMut.mutate(p.id)
              }}
              deleting={deleteProfileMut.isPending && deleteProfileMut.variables === p.id}
            />
          ))}
          rightItems={filteredRoutes.map((route) => (
            <TunnelCard
              key={route.id}
              tunnel={route}
              onEdit={() => openTunnelModal(route)}
              onDelete={async () => {
                if (await alertLib.confirm(t('tunnels.deleteRouteQuestion'), t('tunnels.deleteRouteMessage', { name: route.name }), t('common.delete'), t('common.cancel'), 'warning', 'tunnels')) deleteTunnelMut.mutate(route.id)
              }}
              onSync={() => handleSync(route)}
              isSyncing={syncMut.isPending && syncMut.variables?.id === route.id}
            />
          ))}
        />
      )}
    </div>
  )
}
