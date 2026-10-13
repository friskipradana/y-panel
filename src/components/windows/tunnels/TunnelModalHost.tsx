import { tunnelPayload } from './tunnelForms'
import { TunnelModal } from './TunnelModals'
import type { TunnelsWindowState } from './useTunnelsWindow'

export function TunnelModalHost({ tw }: { tw: TunnelsWindowState }) {
  const {
    showTunnelModal,
    editingTunnelId,
    tunnelForm,
    setTunnelForm,
    safeCfZones,
    zoneOptions,
    protocolOptions,
    profileOptions,
    tunnelProjects,
    projectOptions,
    createTunnelMut,
    updateTunnelMut,
    closeTunnelModal,
  } = tw
  if (!(showTunnelModal)) return null

  return (
    <TunnelModal
      form={tunnelForm}
      setForm={setTunnelForm}
      editing={!!editingTunnelId}
      zoneOptions={zoneOptions}
      cfZones={safeCfZones}
      protocolOptions={protocolOptions}
      profileOptions={profileOptions}
      projectOptions={projectOptions}
      projects={tunnelProjects}
      onClose={closeTunnelModal}
      onSubmit={() => editingTunnelId ? updateTunnelMut.mutate(tunnelForm) : createTunnelMut.mutate(tunnelPayload(tunnelForm))}
      pending={createTunnelMut.isPending || updateTunnelMut.isPending}
    />
  )
}
