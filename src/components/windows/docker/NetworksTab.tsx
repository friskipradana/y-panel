import { toast } from 'sonner'
import { Network, Trash2 } from 'lucide-react'
import { alertLib } from '@/lib/alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { DockerListState, DockerRowIcon, DockerTable } from './DockerTable'
import { BUILTIN_NETWORKS } from './constants'
import type { DockerWindowState } from './useDockerWindow'

const apiError = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

export function NetworksTab({ docker }: { docker: DockerWindowState }) {
  const { t, networksQuery, filteredNetworks, networkUsage, search, showCreateNet, setShowCreateNet, netForm, setNetForm, createNetworkMut, deleteNetworkMut } = docker

  const close = () => {
    setShowCreateNet(false)
    setNetForm({ name: '', subnet: '', gateway: '' })
  }

  const create = () => {
    const name = netForm.name.trim()
    createNetworkMut.mutate(
      { name, subnet: netForm.subnet.trim() || undefined, gateway: netForm.gateway.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('docker.networkCreated', { name }))
          close()
        },
        onError: (e) => alertLib.fire(t('docker.networkCreateFailed'), apiError(e, t('docker.unknownError')), 'error', 'apps'),
      },
    )
  }

  const remove = async (id: string, name: string) => {
    const ok = await alertLib.confirm(t('docker.deleteNetwork'), t('docker.deleteNetworkConfirm', { name }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
    if (!ok) return
    deleteNetworkMut.mutate(id, {
      onSuccess: () => toast.success(t('docker.networkDeleted', { name })),
      onError: (e) => alertLib.fire(t('docker.networkDeleteFailed'), apiError(e, t('docker.unknownError')), 'error', 'apps'),
    })
  }

  return (
    <>
      <Modal
        open={showCreateNet}
        onClose={close}
        title={t('docker.createNetworkTitle')}
        size="md"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button type="button" variant="primary" loading={createNetworkMut.isPending} disabled={!netForm.name.trim()} onClick={create}>
              {t('docker.createNetwork')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('docker.networkNameRequired')}>
            <TextInput mono placeholder={t('docker.networkNamePlaceholder')} value={netForm.name} onChange={(e) => setNetForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={`${t('docker.subnetCidr')} ${t('docker.optional')}`} hint={`${t('docker.ipRangeHint')} 172.20.0.0/16`}>
            <TextInput mono placeholder={t('docker.subnetPlaceholder')} value={netForm.subnet} onChange={(e) => setNetForm((f) => ({ ...f, subnet: e.target.value }))} />
          </Field>
          <Field label={`${t('docker.gateway')} ${t('docker.optional')}`} hint={`${t('docker.gatewayHint')} 172.20.0.1`}>
            <TextInput mono placeholder={t('docker.gatewayPlaceholder')} value={netForm.gateway} onChange={(e) => setNetForm((f) => ({ ...f, gateway: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <DockerTable
        variant="networks"
        empty={networksQuery.isLoading || networksQuery.isError || filteredNetworks.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('docker.col.network') },
          { label: t('docker.col.driver') },
          { label: t('docker.col.subnet') },
          { label: t('docker.col.containers') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <DockerListState
          loading={networksQuery.isLoading}
          error={networksQuery.isError}
          errorTitle={t('docker.networksLoadFailed')}
          errorHint={t('docker.agentAccessHint')}
          loadingText={t('docker.loadingList')}
          empty={filteredNetworks.length === 0}
          emptyIcon={<Network />}
          emptyTitle={search ? t('docker.noResults') : t('docker.noNetworks')}
          emptyHint={search ? undefined : t('docker.noNetworksHint')}
        >
          {filteredNetworks.map((net, idx) => {
            const builtin = BUILTIN_NETWORKS.includes(net.Name)
            const used = networkUsage[net.Name] ?? 0
            const lockHint = builtin ? t('docker.networkBuiltinHint') : used > 0 ? t('docker.networkInUseHint') : t('docker.deleteNetwork')
            return (
              <div key={net.Id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <DockerRowIcon><Network className="h-3.5 w-3.5" strokeWidth={1.75} /></DockerRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={net.Name}>{net.Name}</span>
                    <span className="docker-row__sub">{net.Scope} · {net.Id.slice(0, 12)}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--keep">
                  <span className={`docker-status-pill ${builtin ? 'docker-status-pill--exited' : 'docker-status-pill--running'}`}>
                    <span className="docker-status-dot" />
                    <span>{builtin ? t('docker.builtin') : net.Driver}</span>
                  </span>
                </div>
                <div className="docker-cell docker-cell--mono">
                  {net.Subnet || '-'}
                  {net.Gateway ? <span className="docker-row__sub"> gw {net.Gateway}</span> : null}
                </div>
                <div className="docker-cell">{t('docker.networkContainers', { count: used })}</div>
                <div className="docker-action-btns">
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={lockHint}
                    aria-label={t('docker.deleteNetwork')}
                    disabled={deleteNetworkMut.isPending || builtin || used > 0}
                    onClick={() => void remove(net.Id, net.Name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </DockerListState>
      </DockerTable>
    </>
  )
}
