import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import { Search, Plus, Trash2, Activity } from 'lucide-react'
import type { DockerWindowState } from './useDockerWindow'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput } from '@/components/ui/Field'
import { ListRow } from '@/components/ui/ListRow'
import { Modal } from '@/components/ui/Modal'

export function NetworksTab({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    networksData,
    netSearch,
    setNetSearch,
    showCreateNet,
    setShowCreateNet,
    netForm,
    setNetForm,
    createNetworkMut,
    deleteNetworkMut,
  } = docker

    const allNets = networksData?.items ?? []
    const filteredNets = allNets.filter((net) => {
      const q = netSearch.toLowerCase()
      return !q || net.Name.toLowerCase().includes(q) || net.Driver.toLowerCase().includes(q) || net.Id.toLowerCase().includes(q)
    })

    return (
      <div className="panel-window__stack">
        <Modal
          open={showCreateNet}
          onClose={() => setShowCreateNet(false)}
          title={t('docker.createNetworkTitle')}
          size="md"
          footer={
            <>
            <Button type="button" variant="ghost" onClick={() => setShowCreateNet(false)}>{t('common.cancel')}</Button>
            <Button
              type="button" variant="primary"
              disabled={createNetworkMut.isPending || !netForm.name.trim()}
              onClick={async () => {
                await createNetworkMut.mutateAsync({ name: netForm.name.trim(), subnet: netForm.subnet.trim() || undefined, gateway: netForm.gateway.trim() || undefined })
                toast.success(t('docker.networkCreated', { name: netForm.name }))
                setShowCreateNet(false)
                setNetForm({ name: '', subnet: '', gateway: '' })
              }}
            >
              {createNetworkMut.isPending ? t('common.creating') : t('docker.createNetwork')}
            </Button>
            </>
          }
        >
            <div className="panel-field">
              <label className="panel-label">{t('docker.networkNameRequired')}</label>
              <TextInput placeholder={t('docker.networkNamePlaceholder')} value={netForm.name} onChange={(e) => setNetForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="panel-field">
              <label className="panel-label">{t('docker.subnetCidr')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
              <TextInput placeholder={t('docker.subnetPlaceholder')} value={netForm.subnet} onChange={(e) => setNetForm((f) => ({ ...f, subnet: e.target.value }))} />
              <p className="panel-hint">{t('docker.ipRangeHint')} <code>172.20.0.0/16</code></p>
            </div>
            <div className="panel-field">
              <label className="panel-label">{t('docker.gateway')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
              <TextInput placeholder={t('docker.gatewayPlaceholder')} value={netForm.gateway} onChange={(e) => setNetForm((f) => ({ ...f, gateway: e.target.value }))} />
              <p className="panel-hint">{t('docker.gatewayHint')} <code>172.20.0.1</code></p>
            </div>
        </Modal>

        <div className="panel-table-container">
          <div className="docker-tab-toolbar">
            <div className="docker-tab-toolbar__left">
              <span className="docker-tab-toolbar__title">{t('docker.dockerNetworks')}</span>
              <Badge>{allNets.length}</Badge>
            </div>
            <div className="docker-tab-toolbar__right">
              <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => e.preventDefault()}>
                <Search className="h-3.5 w-3.5" />
                <input className="panel-search__input" placeholder={t('docker.searchNetworkShort')} value={netSearch} onChange={(e) => setNetSearch(e.target.value)} />
              </form>
              <Button type="button" variant="primary-soft" onClick={() => setShowCreateNet(true)} disabled={createNetworkMut.isPending}>
                <Plus className="h-3.5 w-3.5" /> {t('docker.createNetwork')}
              </Button>
            </div>
          </div>
          {filteredNets.length === 0 ? (
            <div className="panel-empty panel-empty--wide">
              <Activity className="h-8 w-8" />
              <div className="text-sm font-medium text-[var(--win-text)]">{netSearch ? t('docker.noResults') : t('docker.noNetworks')}</div>
            </div>
          ) : (
            <>
              {filteredNets.map((net) => (
                <ListRow
                  key={net.Id}
                  title={net.Name}
                  tag={<Badge>{net.Driver}</Badge>}
                  actions={<><IconButton
                      type="button" label={t('docker.deleteNetwork')} tone="danger"
                      onClick={async () => {
                        const ok = await alertLib.confirm(t('docker.deleteNetwork'), t('docker.deleteNetworkConfirm', { name: net.Name }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
                        if (ok) deleteNetworkMut.mutate(net.Id)
                      }}
                      disabled={deleteNetworkMut.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton></>}
                  details={<>{t('docker.scope')} : {net.Scope}<br />
                      {t('docker.subnet')} : {net.Subnet}<br />
                      {t('docker.gateway')} : {net.Gateway}<br />
                      ID : {net.Id.slice(0, 12)}</>}
                />
              ))}
            </>
          )}
        </div>
      </div>
    )
}
