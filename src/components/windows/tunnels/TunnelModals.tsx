import { type CloudflareDomain, type Project } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { toast } from 'sonner'
import { Copy, Globe2, Network, RefreshCw, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import {
  DNS_TYPES,
  type DnsForm,
  type TunnelForm,
  type DomainForm,
  type ProfileForm,
  slugifyRoutePart,
} from './tunnelForms'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'

export function DNSModal({ form, setForm, editing, onClose, onSubmit, pending }: { form: DnsForm; setForm: React.Dispatch<React.SetStateAction<DnsForm>>; editing: boolean; onClose: () => void; onSubmit: () => void; pending: boolean }) {
  const { t } = useI18n()
  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('tunnels.dnsEditTitle') : t('tunnels.dnsCreateTitle')}
      width={560}
      footer={
        <>
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={onSubmit} disabled={pending || !form.type || !form.name || !form.content} variant="primary">{pending ? t('tunnels.saving') : t('tunnels.saveDns')}</Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.dnsModalSubtitle')}</p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="panel-section-label">{t('tunnels.type')}</label><Select id="dns-type" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={DNS_TYPES.map((t) => ({ value: t, label: t }))} /></div>
          <div><label className="panel-section-label">TTL</label><TextInput type="number" value={form.ttl} onChange={(e) => setForm((f) => ({ ...f, ttl: Number(e.target.value) }))} /></div>
        </div>
        <div><label className="panel-section-label">{t('tunnels.name')}</label><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('tunnels.dnsNamePlaceholder')} /></div>
        <div><label className="panel-section-label">{t('tunnels.content')}</label><TextInput value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder={t('tunnels.dnsContentPlaceholder')} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="panel-section-label">{t('tunnels.priority')}</label><TextInput value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} placeholder={t('tunnels.priorityPlaceholder')} /></div>
          <label className="cloudflare-checkbox"><input type="checkbox" checked={form.proxied} onChange={(e) => setForm((f) => ({ ...f, proxied: e.target.checked }))} /> {t('tunnels.proxied')}</label>
        </div>
        <div><label className="panel-section-label">{t('tunnels.comment')}</label><TextInput value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} placeholder={t('tunnels.optional')} /></div>
      </div>
    </Modal>
  )
}

export function DomainStatusPanel({ domain, onCheckStatus, checkingStatus, onDelete, deleting }: { domain: CloudflareDomain; onCheckStatus: () => void; checkingStatus: boolean; onDelete: () => void; deleting: boolean }) {
  const { t } = useI18n()
  const active = domain.status === 'active'
  const pending = !active
  return (
    <div className="cloudflare-domain-status-panel">
      <div className="cloudflare-domain-status-panel__main">
        <div className='!gap-2'>
          <span className={`cloudflare-domain-status-panel__status ${active ? 'is-active' : 'is-pending'}`}>
            <span className="panel-status-dot" />
            {domain.status || 'pending'}
          </span>
          <div className="cloudflare-domain-status-panel__copy">
            {pending ? t('tunnels.domainPendingCopy') : t('tunnels.domainActiveCopy')}
          </div>
        </div>
        <div className='!gap-2'>
          <Button type="button" variant="primary-soft" className="cloudflare-domain-status-panel__check" onClick={onCheckStatus} disabled={checkingStatus}>
            <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
            {checkingStatus ? t('tunnels.checking') : t('tunnels.checkStatus')}
          </Button>
          <IconButton type="button" onClick={onDelete} disabled={deleting} tone="danger" label={t('tunnels.deleteDomainTitle')}>
            {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </IconButton>
        </div>
      </div>
      {domain.name_servers?.length ? (
        <div className="cloudflare-domain-status-panel__ns">
          {(domain.name_servers ?? []).map((ns, idx) => (
            <button key={ns} type="button" className="cloudflare-domain-status-panel__ns-item" onClick={() => navigator.clipboard.writeText(ns).then(() => toast.success(t('tunnels.nameserverCopied', { name: ns })))}>
              <span>NS {idx + 1}</span>
              <strong>{ns}</strong>
              <Copy className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DomainModal({ form, setForm, createdDomain, onClose, onSubmit, pending, onCheckStatus, checkingStatus }: { form: DomainForm; setForm: React.Dispatch<React.SetStateAction<DomainForm>>; createdDomain: CloudflareDomain | null; onClose: () => void; onSubmit: () => void; pending: boolean; onCheckStatus: () => void; checkingStatus: boolean }) {
  const { t } = useI18n()
  return (
    <Modal
      open
      onClose={onClose}
      title={t('tunnels.addDomainTitle')}
      icon={<Globe2 />}
      width={560}
      footer={
        <>
          <Button onClick={onClose} variant="ghost">{t('common.close')}</Button>
          <Button onClick={onSubmit} disabled={pending || !form.name || !!createdDomain} variant="primary">{pending ? t('tunnels.connecting') : t('tunnels.addDomain')}</Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.addDomainSubtitle')}</p>
      <div className="space-y-4">
        <div><label className="panel-section-label">{t('tunnels.domainRequired')}</label><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('tunnels.domainPlaceholder')} /></div>
        {createdDomain && (
          <div className="cloudflare-domain-success">
            <div className="cloudflare-domain-success__head">
              <div className="cloudflare-domain-success__icon"><Globe2 className="h-4 w-4" /></div>
              <div>
                <div className="cloudflare-domain-success__eyebrow">{t('tunnels.domainAddedSuccess')}</div>
                <div className="cloudflare-domain-success__title">{createdDomain.name}</div>
              </div>
              <span className={`cloudflare-domain-success__status ${createdDomain.status === 'active' ? 'is-active' : 'is-pending'}`}>
                {createdDomain.status || 'pending'}
              </span>
            </div>

            <div className="cloudflare-domain-success__steps">
              <div className="cloudflare-domain-success__step"><span>1</span>{t('tunnels.stepRegistrar')}</div>
              <div className="cloudflare-domain-success__step"><span>2</span>{t('tunnels.stepDnsDelegation')}</div>
              <div className="cloudflare-domain-success__step"><span>3</span>{t('tunnels.stepReplaceNameserver')}</div>
            </div>

            <div className="cloudflare-ns-card">
              <div className="cloudflare-ns-card__label">{t('tunnels.requiredNameservers')}</div>
              <div className="cloudflare-ns-card__list">
                {(createdDomain.name_servers ?? []).map((ns, idx) => (
                  <button key={ns} type="button" onClick={() => navigator.clipboard.writeText(ns).then(() => toast.success(t('tunnels.nameserverCopied', { name: ns })))} className="cloudflare-ns-copy-row">
                    <span className="cloudflare-ns-copy-row__index">NS {idx + 1}</span>
                    <span className="cloudflare-ns-copy-row__value">{ns}</span>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="cloudflare-copy-all"
                onClick={() => navigator.clipboard.writeText(createdDomain.name_servers?.join('\n') || '').then(() => toast.success(t('tunnels.allNameserversCopied')))}
              >
                <Copy className="h-3.5 w-3.5" /> {t('tunnels.copyAllNameservers')}
              </button>
            </div>

            <div className="cloudflare-domain-success__actions">
              <Button type="button" variant="primary" onClick={onCheckStatus} disabled={checkingStatus}>
                <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                {checkingStatus ? t('tunnels.checkingDomainStatus') : t('tunnels.checkDomainConnection')}
              </Button>
            </div>

            <p className="cloudflare-domain-success__note">
              {t('tunnels.domainPropagationNote')}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ProfileModal({ form, setForm, onClose, onSubmit, pending }: { form: ProfileForm; setForm: React.Dispatch<React.SetStateAction<ProfileForm>>; onClose: () => void; onSubmit: () => void; pending: boolean }) {
  const { t } = useI18n()
  return (
    <Modal
      open
      onClose={onClose}
      title={t('tunnels.profileCreateTitle')}
      icon={<Network />}
      width={560}
      footer={
        <>
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={onSubmit} disabled={pending || (form.mode === 'custom' && !form.tunnelId)} variant="primary">{pending ? t('tunnels.creating') : t('tunnels.createProfile')}</Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.profileCreateSubtitle')}</p>
      <div className="space-y-4">
        <div><label className="panel-section-label">{t('tunnels.profileName')}</label><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('tunnels.profileNamePlaceholder')} /></div>
        <div><label className="panel-section-label">{t('tunnels.mode')}</label><Select id="profile-mode" value={form.mode} onChange={(v) => setForm((f) => ({ ...f, mode: v as 'managed' | 'custom' }))} options={[{ value: 'managed', label: t('tunnels.managedByPanel') }, { value: 'custom', label: t('tunnels.customExistingTunnel') }]} /></div>
        {form.mode === 'custom' && <div><label className="panel-section-label">{t('tunnels.existingTunnelId')}</label><TextInput value={form.tunnelId} onChange={(e) => setForm((f) => ({ ...f, tunnelId: e.target.value }))} placeholder={t('tunnels.tunnelIdPlaceholder')} /></div>}
      </div>
    </Modal>
  )
}

export function TunnelModal({ form, setForm, editing, zoneOptions, cfZones, protocolOptions, profileOptions, projectOptions, projects, onClose, onSubmit, pending }: { form: TunnelForm; setForm: React.Dispatch<React.SetStateAction<TunnelForm>>; editing: boolean; zoneOptions: { value: string; label: string }[]; cfZones: { id: string; name: string }[]; protocolOptions: { value: string; label: string }[]; profileOptions: { value: string; label: string }[]; projectOptions: { value: string; label: string; description?: string }[]; projects: Project[]; onClose: () => void; onSubmit: () => void; pending: boolean }) {
  const { t } = useI18n()
  const selectProject = (projectId: string) => {
    const project = projects.find((item) => String(item.id) === projectId)
    setForm((current) => {
      if (!project) return { ...current, projectId }
      const routePart = slugifyRoutePart(project.slug || project.name)
      return {
        ...current,
        projectId,
        name: current.name || `${project.name} tunnel`,
        subdomain: current.subdomain || routePart,
        protocol: 'http',
        ip: 'localhost',
        port: String(project.assignedPort),
      }
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('tunnels.routeEditTitle') : t('tunnels.routeNewTitle')}
      icon={<Network />}
      width={560}
      footer={
        <>
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={onSubmit} disabled={pending || !form.name || !form.zoneId || !form.ip || !form.port || (!editing && !form.profileId)} variant="primary">{pending ? t('tunnels.saving') : t('tunnels.saveRoute')}</Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.routeModalSubtitle')}</p>
      <div className="space-y-4">
        {!editing && <div><label className="panel-section-label">{t('tunnels.tunnelProfileRequired')}</label><Select id="route-profile-select" value={form.profileId} onChange={(v) => setForm((f) => ({ ...f, profileId: v }))} options={profileOptions} searchable /></div>}
        <div><label className="panel-section-label">Project sumber</label><Select id="route-project-select" value={form.projectId} onChange={selectProject} options={projectOptions} searchable /></div>
        <div><label className="panel-section-label">{t('tunnels.routeNameRequired')}</label><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('tunnels.routeNamePlaceholder')} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="panel-section-label">{t('tunnels.subdomain')}</label><TextInput value={form.subdomain} onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value }))} placeholder={t('tunnels.subdomainPlaceholder')} /></div>
          <div><label className="panel-section-label">{t('tunnels.domainRequiredShort')}</label><Select id="tunnel-zone-select" value={form.zoneId} onChange={(v) => { const selected = cfZones.find((z) => z.id === v); setForm((f) => ({ ...f, zoneId: v, domain: selected?.name || '' })) }} options={zoneOptions} searchable /></div>
        </div>
        <div><label className="panel-section-label">{t('tunnels.path')}</label><TextInput value={form.path} onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} placeholder={t('tunnels.pathPlaceholder')} /></div>
        <div>
          <label className="panel-section-label">{t('tunnels.targetUrlRequired')}</label>
          <div className="flex items-center gap-2">
            <Select id="tunnel-protocol-select" value={form.protocol} onChange={(v) => setForm((f) => ({ ...f, protocol: v }))} options={protocolOptions} buttonClassName="!w-28" />
            <TextInput value={form.ip} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} className="flex-1" placeholder={t('tunnels.ipPlaceholder')} />
            <span className="text-[var(--text-secondary)]">:</span>
            <TextInput value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} className="!w-24" placeholder={t('tunnels.portPlaceholder')} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
