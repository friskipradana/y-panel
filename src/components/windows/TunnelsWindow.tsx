import { type WindowState } from '@/types'
import { DNSModal, DomainModal } from './tunnels/TunnelModals'
import { useTunnelsWindow } from './tunnels/useTunnelsWindow'
import { TunnelsToolbar } from './tunnels/TunnelsToolbar'
import { CloudflareSetupNotice } from './tunnels/CloudflareSetupNotice'
import { HostingSubdomainsPanel } from './tunnels/HostingSubdomainsPanel'
import { TunnelsBody } from './tunnels/TunnelsBody'
import { TunnelModalHost } from './tunnels/TunnelModalHost'
import { ProfileModalHost } from './tunnels/ProfileModalHost'

export default function TunnelsWindow({ win }: { win?: WindowState }) {
  const tw = useTunnelsWindow({ win })
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

  return (
    <div className="panel-window cloudflare-window">
      <HostingSubdomainsPanel />
      <TunnelsToolbar tw={tw} />
      <CloudflareSetupNotice tw={tw} />
      <TunnelsBody tw={tw} />
      {showDomainModal && <DomainModal form={domainForm} setForm={setDomainForm} createdDomain={createdDomain} onClose={closeDomainModal} onSubmit={() => createDomainMut.mutate()} pending={createDomainMut.isPending} onCheckStatus={() => checkCreatedDomainMut.mutate(undefined)} checkingStatus={checkCreatedDomainMut.isPending} />}

      {showDnsModal && (
        <DNSModal
          form={dnsForm}
          setForm={setDnsForm}
          editing={!!editingDns}
          onClose={() => setShowDnsModal(false)}
          onSubmit={() => editingDns ? updateDnsMut.mutate() : createDnsMut.mutate()}
          pending={createDnsMut.isPending || updateDnsMut.isPending}
        />
      )}
      <TunnelModalHost tw={tw} />
      <ProfileModalHost tw={tw} />
    </div>
  )
}
