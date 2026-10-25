import { type CloudflareDomain, type CloudflareTunnelProfile, type Project } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { toast } from 'sonner'
import { Copy, Globe2, Network, RefreshCw } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import {
  STATUS_CONFIG,
  DNS_TYPES,
  type DnsForm,
  type TunnelForm,
  type DomainForm,
  type ProfileForm,
  SUBDOMAIN_RE,
  slugifyRoutePart,
} from './tunnelForms'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Checkbox } from '@/components/ui/Checkbox'

// Types Cloudflare can put behind its proxy, and the ones that carry a priority
const PROXIABLE = ['A', 'AAAA', 'CNAME']
const WITH_PRIORITY = ['MX', 'SRV']
// TTL in seconds; 1 is Cloudflare's "automatic"
const TTL_CHOICES = [1, 60, 120, 300, 600, 1800, 3600, 43200, 86400]

export function DNSModal({ form, setForm, editing, domainName, onClose, onSubmit, pending }: { form: DnsForm; setForm: React.Dispatch<React.SetStateAction<DnsForm>>; editing: boolean; domainName?: string; onClose: () => void; onSubmit: () => void; pending: boolean }) {
  const { t } = useI18n()
  const proxiable = PROXIABLE.includes(form.type)
  const hasPriority = WITH_PRIORITY.includes(form.type)
  // a proxied record is always automatic: Cloudflare sets it
  const ttlLocked = form.proxied && proxiable
  const ttlLabel = (seconds: number) => (seconds === 1 ? t('tunnels.auto') : seconds < 3600 ? t('tunnels.ttlMinutes', { count: seconds / 60 }) : t('tunnels.ttlHours', { count: seconds / 3600 }))
  const ttlOptions = TTL_CHOICES.includes(Number(form.ttl)) ? TTL_CHOICES : [...TTL_CHOICES, Number(form.ttl)]
  const canSubmit = !pending && !!form.type && !!form.name.trim() && !!form.content.trim() && (!WITH_PRIORITY.includes(form.type) || form.priority !== '')

  const setType = (type: string) =>
    setForm((f) => ({
      ...f,
      type,
      // what the new type cannot carry is dropped, not sent along
      proxied: PROXIABLE.includes(type) ? f.proxied : false,
      priority: WITH_PRIORITY.includes(type) ? f.priority : '',
    }))

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('tunnels.dnsEditTitle') : t('tunnels.dnsCreateTitle')}
      subtitle={domainName}
      icon={<Globe2 />}
      size="md"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={onSubmit} disabled={!canSubmit} loading={pending} variant="primary">{t('tunnels.saveDns')}</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
          <Field label={t('tunnels.type')}>
            <Select id="dns-type" value={form.type} onChange={setType} options={DNS_TYPES.map((type) => ({ value: type, label: type }))} />
          </Field>
          <Field label={t('tunnels.name')} hint={t('tunnels.dnsNameHint')}>
            <TextInput mono value={form.name} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('tunnels.dnsNamePlaceholder')} />
          </Field>
        </div>

        <Field label={t('tunnels.content')} hint={t(`tunnels.dnsContentHint.${form.type}`)}>
          <TextInput mono value={form.content} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder={t(`tunnels.dnsContent.${form.type}`)} />
        </Field>

        <div className={hasPriority ? 'grid gap-3 sm:grid-cols-2' : undefined}>
          <Field label="TTL" hint={ttlLocked ? t('tunnels.ttlLockedHint') : undefined}>
            <Select
              id="dns-ttl"
              value={String(ttlLocked ? 1 : form.ttl)}
              onChange={(v) => setForm((f) => ({ ...f, ttl: Number(v) }))}
              options={ttlOptions.map((seconds) => ({ value: String(seconds), label: ttlLabel(seconds) }))}
              disabled={ttlLocked}
            />
          </Field>
          {hasPriority ? (
            <Field label={t('tunnels.priority')}>
              <TextInput mono value={form.priority} inputMode="numeric" autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value.replace(/\D/g, '') }))} placeholder="10" />
            </Field>
          ) : null}
        </div>

        {proxiable ? (
          <Checkbox
            checked={form.proxied}
            onChange={(checked) => setForm((f) => ({ ...f, proxied: checked, ttl: checked ? 1 : f.ttl }))}
            label={t('tunnels.proxied')}
            description={t('tunnels.proxiedHint')}
          />
        ) : null}

        <Field label={t('tunnels.comment')} htmlFor="dns-comment">
          <TextInput id="dns-comment" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} placeholder={t('tunnels.optional')} />
        </Field>
      </div>
    </Modal>
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

interface TunnelModalProps {
  form: TunnelForm
  setForm: React.Dispatch<React.SetStateAction<TunnelForm>>
  editing: boolean
  zoneOptions: { value: string; label: string }[]
  cfZones: { id: string; name: string }[]
  protocolOptions: { value: string; label: string }[]
  profileOptions: { value: string; label: string }[]
  projectOptions: { value: string; label: string; description?: string }[]
  projects: Project[]
  onClose: () => void
  onSubmit: () => void
  pending: boolean
}

// A route of a tunnel profile, laid out like the "Atur domain" dialog of the Docker window: where it goes
// (profile, protocol), what it points at, then the address it gets
export function TunnelModal({ form, setForm, editing, zoneOptions, cfZones, protocolOptions, profileOptions, projectOptions, projects, onClose, onSubmit, pending }: TunnelModalProps) {
  const { t } = useI18n()

  // a project fills in what it can (its port, a name, a subdomain) and leaves the rest to be edited
  const selectProject = (projectId: string) => {
    const project = projects.find((item) => String(item.id) === projectId)
    setForm((current) => {
      if (!project) return { ...current, projectId }
      const routePart = slugifyRoutePart(project.slug || project.name)
      return {
        ...current,
        projectId,
        name: current.name || project.name,
        subdomain: current.subdomain || routePart,
        protocol: 'http',
        ip: 'localhost',
        port: String(project.assignedPort),
      }
    })
  }

  // the route is named after its subdomain until the name is typed over
  const setSubdomain = (value: string) => {
    const next = value.toLowerCase().trim()
    setForm((current) => ({ ...current, subdomain: next, name: current.name === '' || current.name === current.subdomain ? next : current.name }))
  }

  const zone = cfZones.find((z) => z.id === form.zoneId)
  const subdomainValid = form.subdomain === '' || SUBDOMAIN_RE.test(form.subdomain)
  const hostname = zone && form.subdomain !== '' && subdomainValid ? (form.subdomain === '@' ? zone.name : `${form.subdomain}.${zone.name}`) : ''
  const path = form.path ? (form.path.startsWith('/') ? form.path : `/${form.path}`) : ''
  const canSubmit = !pending && !!form.name && !!form.zoneId && !!form.ip && !!form.port && subdomainValid && (editing || !!form.profileId)

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('tunnels.routeEditTitle') : t('tunnels.routeNewTitle')}
      subtitle={t('tunnels.routeModalSubtitle')}
      icon={<Network />}
      size="md"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={onSubmit} disabled={!canSubmit} loading={pending} variant="primary">{t('tunnels.saveRoute')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {editing ? null : (
          <Field label={t('tunnels.tunnelProfileRequired')} hint={profileOptions.length === 0 ? t('tunnels.noProfileHint') : undefined}>
            <Select id="route-profile-select" value={form.profileId} onChange={(v) => setForm((f) => ({ ...f, profileId: v }))} options={profileOptions} placeholder={t('tunnels.pickProfile')} searchable searchPlaceholder={t('tunnels.searchProfile')} />
          </Field>
        )}

        <section className="space-y-3">
          <p className="panel-section-label">{t('tunnels.sectionPublic')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('tunnels.subdomain')} error={!subdomainValid ? t('tunnels.subdomainInvalid') : undefined}>
              <TextInput mono value={form.subdomain} maxLength={63} autoComplete="off" invalid={!subdomainValid} onChange={(e) => setSubdomain(e.target.value)} placeholder={t('tunnels.subdomainPlaceholder')} />
            </Field>
            <Field label={t('tunnels.domainRequiredShort')}>
              <Select
                id="tunnel-zone-select"
                value={form.zoneId}
                onChange={(v) => {
                  const selected = cfZones.find((z) => z.id === v)
                  setForm((f) => ({ ...f, zoneId: v, domain: selected?.name || '' }))
                }}
                options={zoneOptions}
                placeholder={t('tunnels.pickDomain')}
                searchable
                searchPlaceholder={t('tunnels.searchDomain')}
              />
            </Field>
          </div>
          <Field label={t('tunnels.pathOptional')}>
            <TextInput mono value={form.path} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} placeholder={t('tunnels.pathPlaceholder')} />
          </Field>
        </section>

        <section className="space-y-3">
          <p className="panel-section-label">{t('tunnels.sectionTarget')}</p>
          <Field label={t('tunnels.projectSource')} hint={t('tunnels.projectSourceHint')}>
            <Select id="route-project-select" value={form.projectId} onChange={selectProject} options={projectOptions} searchable searchPlaceholder={t('tunnels.searchProject')} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_7rem]">
            <Field label={t('tunnels.protocol')}>
              <Select id="tunnel-protocol-select" value={form.protocol} onChange={(v) => setForm((f) => ({ ...f, protocol: v }))} options={protocolOptions} />
            </Field>
            <Field label={t('tunnels.targetHost')}>
              <TextInput mono value={form.ip} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} placeholder={t('tunnels.ipPlaceholder')} />
            </Field>
            <Field label={t('tunnels.targetPort')}>
              <TextInput mono value={form.port} inputMode="numeric" autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, port: e.target.value.replace(/\D/g, '') }))} placeholder={t('tunnels.portPlaceholder')} />
            </Field>
          </div>
        </section>

        <Field label={t('tunnels.routeNameRequired')} hint={t('tunnels.routeNameHint')}>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('tunnels.routeNamePlaceholder')} />
        </Field>

        {hostname ? (
          <p className="panel-mono rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12.5px]">
            https://{hostname}
            {path} &rarr; {form.protocol}://{form.ip}:{form.port}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

export function DomainInfoModal({
  domain,
  onClose,
  onCheckStatus,
  checkingStatus,
}: {
  domain: CloudflareDomain
  onClose: () => void
  onCheckStatus?: () => void
  checkingStatus?: boolean
}) {
  const { t } = useI18n()
  const status = STATUS_CONFIG[domain.status ?? 'pending'] ?? STATUS_CONFIG.pending
  const nameServers = domain.name_servers ?? []

  return (
    <Modal
      open
      onClose={onClose}
      title={domain.name}
      subtitle="Cloudflare Zone"
      icon={<Globe2 />}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          {onCheckStatus && domain.status !== 'active' ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onCheckStatus}
              disabled={checkingStatus}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
              {checkingStatus ? t('tunnels.checking') : t('tunnels.checkStatus')}
            </Button>
          ) : <div />}
          <Button onClick={onClose} variant="ghost" size="sm">
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Properties table */}
        <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)] overflow-hidden text-[12px]">
          {/* Status Row */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)] font-medium">{t('common.status')}</span>
            <span className={`docker-status-pill docker-status-pill--${domain.status === 'active' ? 'running' : 'paused'}`}>
              <span className="docker-status-dot" />
              <span>{t(status.labelKey)}</span>
            </span>
          </div>

          {/* Zone ID Row */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)] font-medium">Zone ID</span>
            <div className="flex items-center gap-1.5">
              <span className="panel-mono text-[11px] text-[var(--win-text)] select-all">{domain.id}</span>
              <button
                type="button"
                className="docker-act-btn w-6 h-6 min-h-0 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
                title={t('tunnels.copy')}
                onClick={() => {
                  navigator.clipboard.writeText(domain.id).then(() => {
                    toast.success(`Zone ID tersalin: ${domain.id}`)
                  })
                }}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Nameservers section */}
        {nameServers.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                {t('tunnels.requiredNameservers')}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--panel-primary-text)] hover:underline cursor-pointer"
                onClick={() =>
                  navigator.clipboard
                    .writeText(nameServers.join('\n'))
                    .then(() => toast.success(t('tunnels.allNameserversCopied')))
                }
              >
                <Copy className="h-3 w-3" />
                <span>{t('tunnels.copyAllNameservers')}</span>
              </button>
            </div>

            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)] overflow-hidden">
              {nameServers.map((ns, idx) => (
                <div key={ns} className="flex items-center justify-between px-3 py-2 text-[12px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="panel-mono text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--win-bar)] px-1.5 py-0.5 rounded border border-[var(--win-border)]">
                      NS{idx + 1}
                    </span>
                    <span className="panel-mono text-[12px] text-[var(--win-text)] truncate select-all">
                      {ns}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="docker-act-btn w-6 h-6 min-h-0 shrink-0 ml-2 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
                    title={t('tunnels.copy')}
                    onClick={() =>
                      navigator.clipboard.writeText(ns).then(() =>
                        toast.success(t('tunnels.nameserverCopied', { name: ns }))
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {domain.status !== 'active' ? (
          <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed px-1">
            {t('tunnels.domainPropagationNote')}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

export function ProfileInfoModal({
  profile,
  onClose,
}: {
  profile: CloudflareTunnelProfile
  onClose: () => void
}) {
  const { t } = useI18n()
  const status = STATUS_CONFIG[profile.status] ?? STATUS_CONFIG.pending
  const title = profile.name || String(profile.id)

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle="Tunnel Profile"
      icon={<Network />}
      size="md"
      footer={
        <Button onClick={onClose} variant="ghost" size="sm">
          {t('common.close')}
        </Button>
      }
    >
      <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)] overflow-hidden text-[12px]">
        {/* Status */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">{t('common.status')}</span>
          <span className={`docker-status-pill docker-status-pill--${status.tone === 'success' ? 'running' : 'paused'}`}>
            <span className="docker-status-dot" />
            <span>{t(status.labelKey)}</span>
          </span>
        </div>

        {/* Tunnel ID */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">Tunnel ID</span>
          <div className="flex items-center gap-1.5">
            <span className="panel-mono text-[11px] text-[var(--win-text)] select-all">{profile.id}</span>
            <button
              type="button"
              className="docker-act-btn w-6 h-6 min-h-0 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
              title={t('tunnels.copy')}
              onClick={() => {
                navigator.clipboard.writeText(profile.id).then(() => {
                  toast.success(`Tunnel ID tersalin: ${profile.id}`)
                })
              }}
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Routes */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">Routes</span>
          <span className="panel-mono font-medium text-[var(--win-text)]">{profile.routeCount ?? 0}</span>
        </div>

        {/* Daemon */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[var(--text-secondary)] font-medium">Daemon</span>
          <span className="font-medium text-[var(--win-text)]">
            {profile.daemonRunning ? t('tunnels.daemonRunning') : t('tunnels.daemonIdle')}
          </span>
        </div>
      </div>
    </Modal>
  )
}
