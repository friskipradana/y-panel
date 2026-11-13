import { useState } from 'react'
import { Cloud, Globe2, KeyRound, RefreshCw, Settings } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconBadge } from '@/components/ui/IconBadge'
import { type WindowState } from '@/types'
import { DNSModal, DomainModal } from './tunnels/TunnelModals'
import { useTunnelsWindow } from './tunnels/useTunnelsWindow'
import { TunnelsToolbar } from './tunnels/TunnelsToolbar'
import { HostingCustomDomainsPanel } from './tunnels/HostingCustomDomainsPanel'
import { HostingSubdomainsPanel } from './tunnels/HostingSubdomainsPanel'
import { TunnelsBody } from './tunnels/TunnelsBody'
import { TunnelModalHost } from './tunnels/TunnelModalHost'
import { ProfileModalHost } from './tunnels/ProfileModalHost'
import { openCloudflareSettings } from './tunnels/openCloudflareSettings'

export default function TunnelsWindow({ win }: { win?: WindowState }) {
  const tw = useTunnelsWindow({ win })
  const { t } = useI18n()
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const isSuperadmin = role === 'superadmin'
  const hasPersonalCf = !tw.cfNotConfigured
  const [nonAdminTab, setNonAdminTab] = useState<'hosting' | 'domains' | 'tunnels'>('hosting')

  const {
    showDnsModal,
    setShowDnsModal,
    showDomainModal,
    createdDomain,
    editingDns,
    dnsForm,
    setDnsForm,
    domainForm,
    setDomainForm,
    createDomainMut,
    checkCreatedDomainMut,
    createDnsMut,
    updateDnsMut,
    closeDomainModal,
  } = tw

  const isFetchingHosting =
    qc.isFetching({ queryKey: ['my-subdomains'] }) > 0 ||
    qc.isFetching({ queryKey: ['my-custom-domains'] }) > 0

  const handleRefreshHosting = () => {
    void qc.invalidateQueries({ queryKey: ['my-subdomains'] })
    void qc.invalidateQueries({ queryKey: ['my-custom-domains'] })
  }

  // Superadmin view: full Cloudflare zone and tunnel control panel
  if (isSuperadmin) {
    return (
      <div className="panel-window docker-window-root relative overflow-hidden">
        <TunnelsToolbar tw={tw} />
        <TunnelsBody tw={tw} />
        {showDomainModal && (
          <DomainModal
            form={domainForm}
            setForm={setDomainForm}
            createdDomain={createdDomain}
            onClose={closeDomainModal}
            onSubmit={() => createDomainMut.mutate()}
            pending={createDomainMut.isPending}
            onCheckStatus={() => checkCreatedDomainMut.mutate(undefined)}
            checkingStatus={checkCreatedDomainMut.isPending}
          />
        )}
        {showDnsModal && (
          <DNSModal
            form={dnsForm}
            setForm={setDnsForm}
            editing={!!editingDns}
            domainName={tw.selectedDomain?.name}
            onClose={() => setShowDnsModal(false)}
            onSubmit={() => (editingDns ? updateDnsMut.mutate() : createDnsMut.mutate())}
            pending={createDnsMut.isPending || updateDnsMut.isPending}
          />
        )}
        <TunnelModalHost tw={tw} />
        <ProfileModalHost tw={tw} />
      </div>
    )
  }

  // Non-superadmin view (hosting user / subscriber)
  return (
    <div className="panel-window docker-window-root relative overflow-hidden">
      {hasPersonalCf ? (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu
              label={t('tunnels.tabs')}
              value={nonAdminTab}
              onChange={(key) => setNonAdminTab(key as 'hosting' | 'domains' | 'tunnels')}
              items={[
                { key: 'hosting', label: t('tunnels.hostingTab') },
                { key: 'domains', label: t('tunnels.domainTab'), count: tw.safeDomains.length },
                { key: 'tunnels', label: t('tunnels.tunnelsTab'), count: tw.safeProfiles.length },
              ]}
            />
          </div>
          <div className="docker-topbar__right">
            <button
              type="button"
              className="docker-icon-btn"
              title={t('tunnels.refreshAddresses')}
              aria-label={t('tunnels.refreshAddresses')}
              onClick={handleRefreshHosting}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetchingHosting ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="docker-icon-btn docker-icon-btn--success shrink-0"
              title={t('tunnels.tokenActive')}
              aria-label={t('tunnels.openCloudflareSettings')}
              onClick={openCloudflareSettings}
            >
              <KeyRound className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left flex items-center gap-2">
            <IconBadge size="sm" tone="primary">
              <Globe2 className="h-4 w-4" strokeWidth={1.75} />
            </IconBadge>
            <span className="font-semibold text-[13px] text-[var(--win-text)]">
              {t('tunnels.domainAndHosting')}
            </span>
          </div>
          <div className="docker-topbar__right">
            <button
              type="button"
              className="docker-icon-btn"
              title={t('tunnels.refreshAddresses')}
              aria-label={t('tunnels.refreshAddresses')}
              onClick={handleRefreshHosting}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetchingHosting ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="docker-icon-btn docker-icon-btn--muted shrink-0"
              title={t('tunnels.openCloudflareSettings')}
              aria-label={t('tunnels.openCloudflareSettings')}
              onClick={openCloudflareSettings}
            >
              <KeyRound className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {hasPersonalCf && nonAdminTab !== 'hosting' ? (
        <>
          <TunnelsToolbar tw={tw} />
          <TunnelsBody tw={tw} />
        </>
      ) : (
        <div className="docker-window__body flex-1 overflow-y-auto p-4 space-y-4">
          <HostingSubdomainsPanel />
          <HostingCustomDomainsPanel />

          <div className="panel-shell-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--panel-surface)]">
            <div className="flex items-start gap-3 min-w-0">
              <Cloud className="h-4 w-4 text-[var(--text-secondary)] mt-0.5 shrink-0" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="font-semibold text-[12.5px] text-[var(--win-text)]">{t('tunnels.optionalCfTitle')}</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
                  {t('tunnels.optionalCfDesc')}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={<Settings className="h-3.5 w-3.5" />}
              onClick={openCloudflareSettings}
              className="shrink-0 self-start sm:self-center"
            >
              {t('tunnels.openCloudflareSettings')}
            </Button>
          </div>
        </div>
      )}

      {showDomainModal && (
        <DomainModal
          form={domainForm}
          setForm={setDomainForm}
          createdDomain={createdDomain}
          onClose={closeDomainModal}
          onSubmit={() => createDomainMut.mutate()}
          pending={createDomainMut.isPending}
          onCheckStatus={() => checkCreatedDomainMut.mutate(undefined)}
          checkingStatus={checkCreatedDomainMut.isPending}
        />
      )}

      {showDnsModal && (
        <DNSModal
          form={dnsForm}
          setForm={setDnsForm}
          editing={!!editingDns}
          domainName={tw.selectedDomain?.name}
          onClose={() => setShowDnsModal(false)}
          onSubmit={() => (editingDns ? updateDnsMut.mutate() : createDnsMut.mutate())}
          pending={createDnsMut.isPending || updateDnsMut.isPending}
        />
      )}
      <TunnelModalHost tw={tw} />
      <ProfileModalHost tw={tw} />
    </div>
  )
}
