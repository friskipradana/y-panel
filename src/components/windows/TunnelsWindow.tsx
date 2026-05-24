import { useEffect, useMemo, useState } from 'react'
import type { WindowState } from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCloudflareDNSRecord,
  createCloudflareDomain,
  createCloudflareTunnelProfile,
  createTunnel,
  deleteCloudflareDNSRecord,
  deleteCloudflareDomain,
  deleteCloudflareTunnelProfile,
  deleteTunnel,
  getCFConfig,
  getCFZones,
  getCloudflareDomain,
  listProjects,
  listCloudflareDNSRecords,
  listCloudflareDomains,
  listCloudflareTunnelProfileRoutes,
  listCloudflareTunnelProfiles,
  updateCloudflareDNSRecord,
  updateTunnel,
  type CloudflareDNSRecord,
  type CloudflareDNSRecordPayload,
  type CloudflareDomain,
  type CloudflareTunnelProfile,
  type Project,
  type Tunnel,
} from '@/api/agent'
import { PanelSelectMenu } from '@/components/system/PanelSelectMenu'
import { alertLib } from '@/lib/alert'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe2,
  Layers3,
  Network,
  Pencil,
  Plus,
  RefreshCcw,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const STATUS_CONFIG: Record<string, { variant: string; labelKey: string }> = {
  active: { variant: 'panel-status--success', labelKey: 'tunnels.status.active' },
  healthy: { variant: 'panel-status--success', labelKey: 'tunnels.status.healthy' },
  down: { variant: 'panel-status--danger', labelKey: 'tunnels.status.down' },
  degraded: { variant: 'panel-status--warning', labelKey: 'tunnels.status.degraded' },
  creating: { variant: 'panel-status--warning', labelKey: 'tunnels.status.creating' },
  pending: { variant: 'panel-status--warning', labelKey: 'tunnels.status.pending' },
  error: { variant: 'panel-status--danger', labelKey: 'tunnels.status.error' },
  inactive: { variant: 'panel-status--neutral', labelKey: 'tunnels.status.inactive' },
}

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'NS', 'CAA']
const emptyDnsForm = { type: 'A', name: '', content: '', ttl: 1, proxied: false, priority: '', comment: '' }
const emptyTunnelForm = { name: '', subdomain: '', domain: '', zoneId: '', profileId: '', path: '', protocol: 'http', ip: 'localhost', port: '3000', projectId: '' }
const emptyDomainForm = { name: '' }
const emptyProfileForm = { name: '', mode: 'managed' as 'managed' | 'custom', tunnelId: '' }

type DnsForm = typeof emptyDnsForm
type TunnelForm = typeof emptyTunnelForm
type DomainForm = typeof emptyDomainForm
type ProfileForm = typeof emptyProfileForm

function buildTunnelFormFromTunnel(t: Tunnel, cfZones: { id: string; name: string }[]): TunnelForm {
  let protocol = 'http'
  let ip = 'localhost'
  let port = '3000'
  let path = ''

  try {
    const parsed = new URL(t.targetUrl)
    protocol = parsed.protocol.replace(':', '')
    const hostParts = parsed.host.split(':')
    ip = hostParts[0] || 'localhost'
    port = hostParts[1] || (protocol === 'https' ? '443' : '80')
    path = parsed.pathname === '/' ? '' : parsed.pathname
  } catch {
    // keep defaults for malformed/legacy targets
  }

  let subdomain = ''
  let domain = ''
  let zoneId = ''

  if (t.cfHostname) {
    const zone = cfZones.find((z) => t.cfHostname.endsWith(z.name))
    if (zone) {
      zoneId = zone.id
      domain = zone.name
      if (t.cfHostname !== zone.name) subdomain = t.cfHostname.slice(0, -(zone.name.length + 1))
    } else {
      const parts = t.cfHostname.split('.')
      if (parts.length > 2) {
        subdomain = parts[0]
        domain = parts.slice(1).join('.')
      } else {
        domain = t.cfHostname
      }
    }
  }

  return { name: t.name, subdomain, domain, zoneId, profileId: t.cfTunnelId || '', path, protocol, ip, port, projectId: t.projectId ? String(t.projectId) : '' }
}

function slugifyRoutePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function tunnelPayload(form: TunnelForm): Parameters<typeof createTunnel>[0] {
  return {
    ...form,
    projectId: form.projectId ? Number(form.projectId) : null,
  }
}

export default function TunnelsWindow({ win }: { win?: WindowState }) {
  const pollingActive = useWindowPollingActive(win)
  const { t } = useI18n()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'domains' | 'tunnels'>('domains')
  const [selectedDomainId, setSelectedDomainId] = useState('')
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [domainSearch, setDomainSearch] = useState('')
  const [dnsSearch, setDnsSearch] = useState('')
  const [profileSearch, setProfileSearch] = useState('')
  const [routeSearch, setRouteSearch] = useState('')
  const [showDnsModal, setShowDnsModal] = useState(false)
  const [showDomainModal, setShowDomainModal] = useState(false)
  const [createdDomain, setCreatedDomain] = useState<CloudflareDomain | null>(null)
  const [editingDns, setEditingDns] = useState<CloudflareDNSRecord | null>(null)
  const [dnsForm, setDnsForm] = useState<DnsForm>(emptyDnsForm)
  const [domainForm, setDomainForm] = useState<DomainForm>(emptyDomainForm)
  const [showTunnelModal, setShowTunnelModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [editingTunnelId, setEditingTunnelId] = useState<number | null>(null)
  const [tunnelForm, setTunnelForm] = useState<TunnelForm>(emptyTunnelForm)
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm)

  const { data: cfConfig } = useQuery({ queryKey: ['cf-config'], queryFn: getCFConfig })
  const cfNotConfigured = !cfConfig?.configured || cfConfig?.status !== 'active'
  const { data: cfZones = [] } = useQuery({ queryKey: ['cf-zones'], queryFn: getCFZones, enabled: !cfNotConfigured })
  const { data: domains = [], isLoading: domainsLoading, refetch: refetchDomains, isFetching: domainsFetching } = useQuery({ queryKey: ['cloudflare-domains'], queryFn: listCloudflareDomains, enabled: !cfNotConfigured })
  const { data: selectedDomainDetail } = useQuery({ queryKey: ['cloudflare-domain', selectedDomainId], queryFn: () => getCloudflareDomain(selectedDomainId), enabled: !cfNotConfigured && !!selectedDomainId })
  const { data: dnsRecords = [], isLoading: dnsLoading } = useQuery({ queryKey: ['cloudflare-dns', selectedDomainId], queryFn: () => listCloudflareDNSRecords(selectedDomainId), enabled: !cfNotConfigured && !!selectedDomainId })
  const { data: profiles = [], isLoading: profilesLoading, refetch: refetchProfiles, isFetching: profilesFetching } = useQuery({ queryKey: ['cloudflare-tunnel-profiles'], queryFn: listCloudflareTunnelProfiles, enabled: !cfNotConfigured, refetchInterval: pollingActive ? 8_000 : false })
  const { data: profileRoutes = [], isLoading: routesLoading } = useQuery({ queryKey: ['cloudflare-profile-routes', selectedProfileId], queryFn: () => listCloudflareTunnelProfileRoutes(selectedProfileId), enabled: !cfNotConfigured && !!selectedProfileId, refetchInterval: pollingActive ? 8_000 : false })
  const { data: projectData } = useQuery({ queryKey: ['projects', { tunnelTargets: true }], queryFn: () => listProjects({ all: true, limit: 100, offset: 0 }), enabled: !cfNotConfigured })

  const safeCfZones = Array.isArray(cfZones) ? cfZones : []
  const safeDomains = Array.isArray(domains) ? domains : []
  const safeDnsRecords = Array.isArray(dnsRecords) ? dnsRecords : []
  const safeProfiles = Array.isArray(profiles) ? profiles : []
  const safeProfileRoutes = Array.isArray(profileRoutes) ? profileRoutes : []
  const safeProjects = Array.isArray(projectData?.items) ? projectData.items : []

  useEffect(() => {
    if (!win?.params) return
    if (win.params.tab === 'tunnels') setTab('tunnels')
    if (win.params.action === 'createTunnel') {
      setEditingTunnelId(null)
      const projectId = Number(win.params.projectId ?? 0) || 0
      const projectName = typeof win.params.projectName === 'string' ? win.params.projectName : ''
      const projectSlug = typeof win.params.projectSlug === 'string' ? win.params.projectSlug : slugifyRoutePart(projectName)
      const projectPort = Number(win.params.projectPort ?? 0) || 0
      const routeName = projectName ? `${projectName} tunnel` : ''
      setTunnelForm({
        ...emptyTunnelForm,
        name: routeName,
        subdomain: slugifyRoutePart(projectSlug || projectName),
        profileId: selectedProfileId || '',
        protocol: 'http',
        ip: 'localhost',
        port: projectPort > 0 ? String(projectPort) : emptyTunnelForm.port,
        projectId: projectId > 0 ? String(projectId) : '',
      })
      setShowTunnelModal(true)
    }
  }, [selectedProfileId, win?.params?.action, win?.params?.shortcutNonce, win?.params?.tab])

  useEffect(() => {
    if (!selectedDomainId && safeDomains.length) setSelectedDomainId(safeDomains[0].id)
  }, [safeDomains, selectedDomainId])

  useEffect(() => {
    if (!selectedProfileId && safeProfiles.length) setSelectedProfileId(safeProfiles[0].id)
  }, [safeProfiles, selectedProfileId])

  const selectedDomain = selectedDomainDetail ?? safeDomains.find((d) => d.id === selectedDomainId)
  const selectedProfile = safeProfiles.find((p) => p.id === selectedProfileId)
  const filteredDomains = safeDomains.filter((d) => d.name.toLowerCase().includes(domainSearch.toLowerCase()))
  const filteredDns = safeDnsRecords.filter((r) => `${r.type} ${r.name} ${r.content}`.toLowerCase().includes(dnsSearch.toLowerCase()))
  const filteredProfiles = safeProfiles.filter((p) => `${p.name} ${p.id} ${p.status}`.toLowerCase().includes(profileSearch.toLowerCase()))
  const filteredRoutes = safeProfileRoutes.filter((r) => `${r.name} ${r.cfHostname} ${r.targetUrl} ${r.status}`.toLowerCase().includes(routeSearch.toLowerCase()))
  const zoneOptions = useMemo(() => safeCfZones.map((zone) => ({ value: zone.id, label: zone.name })), [safeCfZones])
  const protocolOptions = useMemo(() => [{ value: 'http', label: 'http://' }, { value: 'https', label: 'https://' }], [])
  const profileOptions = useMemo(() => safeProfiles.map((p) => ({ value: p.id, label: p.name || p.id })), [safeProfiles])
  const tunnelProjects = useMemo(() => safeProjects.filter((project) => project.assignedPort > 0), [safeProjects])
  const projectOptions = useMemo(
    () => [
      { value: '', label: 'Manual target' },
      ...tunnelProjects.map((project) => ({
        value: String(project.id),
        label: `${project.name} :${project.assignedPort}`,
        description: `${project.projectType}${project.running ? ' - running' : ''}`,
      })),
    ],
    [tunnelProjects],
  )

  const dnsPayload = (): CloudflareDNSRecordPayload => ({
    type: dnsForm.type,
    name: dnsForm.name,
    content: dnsForm.content,
    ttl: Number(dnsForm.ttl) || 1,
    proxied: dnsForm.proxied,
    priority: dnsForm.priority === '' ? undefined : Number(dnsForm.priority),
    comment: dnsForm.comment || undefined,
  })

  const createDomainMut = useMutation({
    mutationFn: () => createCloudflareDomain(domainForm.name),
    onSuccess: (zone) => {
      toast.success(t('tunnels.domainAdded'))
      setCreatedDomain(zone)
      setSelectedDomainId(zone.id)
      qc.invalidateQueries({ queryKey: ['cloudflare-domains'] })
    },
    onError: (e: any) => toast.error(t('tunnels.addDomainFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const checkCreatedDomainMut = useMutation({
    mutationFn: async (zoneId?: string) => {
      const targetZoneId = zoneId || createdDomain?.id
      if (!targetZoneId) throw new Error(t('tunnels.noDomainSelected'))
      return getCloudflareDomain(targetZoneId)
    },
    onSuccess: (zone) => {
      setCreatedDomain(zone)
      setSelectedDomainId(zone.id)
      qc.invalidateQueries({ queryKey: ['cloudflare-domains'] })
      qc.invalidateQueries({ queryKey: ['cloudflare-domain', zone.id] })
      if (zone.status === 'active') toast.success(t('tunnels.domainActive'))
      else toast.info(t('tunnels.domainStillStatus', { status: zone.status || 'pending' }))
    },
    onError: (e: any) => toast.error(t('tunnels.checkDomainFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const createDnsMut = useMutation({
    mutationFn: () => createCloudflareDNSRecord(selectedDomainId, dnsPayload()),
    onSuccess: () => {
      toast.success(t('tunnels.dnsCreated'))
      setShowDnsModal(false)
      qc.invalidateQueries({ queryKey: ['cloudflare-dns', selectedDomainId] })
    },
    onError: (e: any) => toast.error(t('tunnels.createDnsFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const updateDnsMut = useMutation({
    mutationFn: () => updateCloudflareDNSRecord(selectedDomainId, editingDns!.id, dnsPayload()),
    onSuccess: () => {
      toast.success(t('tunnels.dnsUpdated'))
      setShowDnsModal(false)
      setEditingDns(null)
      qc.invalidateQueries({ queryKey: ['cloudflare-dns', selectedDomainId] })
    },
    onError: (e: any) => toast.error(t('tunnels.updateDnsFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const deleteDnsMut = useMutation({
    mutationFn: (recordId: string) => deleteCloudflareDNSRecord(selectedDomainId, recordId),
    onSuccess: () => {
      toast.success(t('tunnels.dnsDeleted'))
      qc.invalidateQueries({ queryKey: ['cloudflare-dns', selectedDomainId] })
    },
    onError: (e: any) => toast.error(t('tunnels.deleteDnsFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const deleteDomainMut = useMutation({
    mutationFn: (zoneId: string) => deleteCloudflareDomain(zoneId),
    onSuccess: () => {
      toast.success(t('tunnels.domainDeleted'))
      setSelectedDomainId('')
      qc.invalidateQueries({ queryKey: ['cloudflare-domains'] })
      qc.invalidateQueries({ queryKey: ['cf-zones'] })
    },
    onError: (e: any) => toast.error(t('tunnels.deleteDomainFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const createProfileMut = useMutation({
    mutationFn: () => createCloudflareTunnelProfile(profileForm),
    onSuccess: (profile) => {
      toast.success(t('tunnels.profileCreated'))
      setSelectedProfileId(profile.id)
      setShowProfileModal(false)
      setProfileForm(emptyProfileForm)
      qc.setQueryData<CloudflareTunnelProfile[]>(['cloudflare-tunnel-profiles'], (current = []) => {
        if (current.some((item) => item.id === profile.id)) return current
        return [profile, ...current]
      })
      qc.invalidateQueries({ queryKey: ['cloudflare-tunnel-profiles'] })
    },
    onError: (e: any) => toast.error(t('tunnels.createProfileFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const deleteProfileMut = useMutation({
    mutationFn: deleteCloudflareTunnelProfile,
    onSuccess: (_, profileId) => {
      toast.success(t('tunnels.profileDeleted'))
      if (selectedProfileId === profileId) setSelectedProfileId('')
      qc.invalidateQueries({ queryKey: ['cloudflare-tunnel-profiles'] })
      qc.invalidateQueries({ queryKey: ['cloudflare-profile-routes', profileId] })
    },
    onError: (e: any) => toast.error(t('tunnels.deleteProfileFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const createTunnelMut = useMutation({
    mutationFn: createTunnel,
    onSuccess: (res, variables) => {
      const profileId = variables.profileId || selectedProfileId
      const hostname = variables.subdomain && variables.subdomain !== '@'
        ? `${variables.subdomain}.${variables.domain}`
        : variables.domain
      const targetPath = variables.path?.startsWith('/') ? variables.path : variables.path ? `/${variables.path}` : ''
      const optimisticRoute: Tunnel = {
        id: res.id,
        userId: 0,
        projectId: variables.projectId ?? null,
        name: variables.name,
        targetUrl: `${variables.protocol}://${variables.ip}:${variables.port}${targetPath}`,
        status: 'creating',
        cfTunnelId: profileId || 'pending',
        cfHostname: hostname,
        daemonRunning: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      alertLib.fire(t('tunnels.routeProcessing'), res.message ?? t('tunnels.routeProcessingMessage'), 'info', 'tunnels')
      setTab('tunnels')
      setRouteSearch('')
      if (profileId) {
        setSelectedProfileId(profileId)
        qc.setQueryData<Tunnel[]>(['cloudflare-profile-routes', profileId], (current = []) => {
          if (current.some((route) => route.id === res.id)) return current
          return [optimisticRoute, ...current]
        })
      }
      closeTunnelModal()
      qc.invalidateQueries({ queryKey: ['cloudflare-tunnel-profiles'] })
      if (profileId) qc.invalidateQueries({ queryKey: ['cloudflare-profile-routes', profileId] })
      else qc.invalidateQueries({ queryKey: ['cloudflare-profile-routes'] })
    },
    onError: (e: any) => toast.error(t('tunnels.createRouteFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const updateTunnelMut = useMutation({
    mutationFn: (payload: TunnelForm) => updateTunnel(editingTunnelId!, tunnelPayload(payload)),
    onSuccess: () => {
      toast.success(t('tunnels.routeUpdated'))
      closeTunnelModal()
      qc.invalidateQueries({ queryKey: ['cloudflare-tunnel-profiles'] })
      qc.invalidateQueries({ queryKey: ['cloudflare-profile-routes'] })
    },
    onError: (e: any) => toast.error(t('tunnels.updateRouteFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const deleteTunnelMut = useMutation({
    mutationFn: deleteTunnel,
    onSuccess: () => {
      toast.success(t('tunnels.routeDeleted'))
      qc.invalidateQueries({ queryKey: ['cloudflare-tunnel-profiles'] })
      qc.invalidateQueries({ queryKey: ['cloudflare-profile-routes'] })
    },
    onError: (e: any) => toast.error(t('tunnels.deleteRouteFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const syncMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTunnel>[1] }) => updateTunnel(id, payload),
    onSuccess: () => {
      toast.success(t('tunnels.synced'))
      qc.invalidateQueries({ queryKey: ['cloudflare-profile-routes'] })
    },
    onError: (e: any) => toast.error(t('tunnels.syncFailed'), { description: e.response?.data?.error ?? e.message }),
  })

  const openDnsModal = (record?: CloudflareDNSRecord) => {
    setEditingDns(record ?? null)
    setDnsForm(record ? {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl || 1,
      proxied: record.proxied,
      priority: record.priority?.toString() ?? '',
      comment: record.comment ?? '',
    } : emptyDnsForm)
    setShowDnsModal(true)
  }

  const closeTunnelModal = () => {
    setShowTunnelModal(false)
    setEditingTunnelId(null)
    setTunnelForm(emptyTunnelForm)
  }

  const closeDomainModal = () => {
    setShowDomainModal(false)
    setCreatedDomain(null)
    setDomainForm(emptyDomainForm)
  }

  const openTunnelModal = (route?: Tunnel) => {
    setEditingTunnelId(route?.id ?? null)
    setTunnelForm(route ? buildTunnelFormFromTunnel(route, safeCfZones) : { ...emptyTunnelForm, profileId: selectedProfileId || '' })
    setShowTunnelModal(true)
  }

  const handleSync = (route: Tunnel) => syncMut.mutate({ id: route.id, payload: tunnelPayload(buildTunnelFormFromTunnel(route, safeCfZones)) })

  return (
    <div className="panel-window cloudflare-window">
      <div className="panel-window__header cloudflare-window__header">
        <div className="panel-window__title">
          <Globe2 className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Cloudflare</div>
            <div className="panel-window__meta">
              {t('tunnels.summary', { domains: safeDomains.length, dns: safeDnsRecords.length, profiles: safeProfiles.length })}
            </div>
          </div>
        </div>
        <div className="panel-window__actions cloudflare-window__actions">
          <button onClick={() => tab === 'domains' ? refetchDomains() : refetchProfiles()} className="panel-icon-btn" aria-label={t('tunnels.refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${(domainsFetching || profilesFetching) ? 'animate-spin' : ''}`} />
          </button>
          {tab === 'domains' ? (
            <>
              <button onClick={() => setShowDomainModal(true)} disabled={cfNotConfigured} className="panel-btn panel-btn--primary-soft disabled:cursor-not-allowed">
                <Plus className="h-3.5 w-3.5" /> {t('tunnels.addDomain')}
              </button>
              <button onClick={() => openDnsModal()} disabled={cfNotConfigured || !selectedDomainId} className="panel-btn panel-btn--primary disabled:cursor-not-allowed">
                <Plus className="h-3.5 w-3.5" /> {t('tunnels.createDns')}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setShowProfileModal(true)} disabled={cfNotConfigured} className="panel-btn panel-btn--primary-soft disabled:cursor-not-allowed">
                <Plus className="h-3.5 w-3.5" /> {t('tunnels.createProfile')}
              </button>
              <button onClick={() => openTunnelModal()} disabled={cfNotConfigured || !selectedProfileId} className="panel-btn panel-btn--primary disabled:cursor-not-allowed">
                <Plus className="h-3.5 w-3.5" /> {t('tunnels.createRoute')}
              </button>
            </>
          )}
        </div>
      </div>

      {cfNotConfigured && (
        <div className="px-4 pt-3">
          <div className="panel-alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{t('tunnels.notConfigured')}</span>
          </div>
        </div>
      )}

      <div className="cloudflare-topbar">
        <div className="cloudflare-tabs">
          <button className={`cloudflare-tabs__item ${tab === 'domains' ? 'is-active' : ''}`} onClick={() => setTab('domains')}>
            <Globe2 className="h-3.5 w-3.5" /> {t('tunnels.domainTab')}
            <span className="cloudflare-tabs__count">{safeDomains.length}</span>
          </button>
          <button className={`cloudflare-tabs__item ${tab === 'tunnels' ? 'is-active' : ''}`} onClick={() => setTab('tunnels')}>
            <Network className="h-3.5 w-3.5" /> {t('tunnels.tunnelsTab')}
            <span className="cloudflare-tabs__count">{safeProfiles.length}</span>
          </button>
        </div>
        <div className="cloudflare-hint">
          <ShieldCheck className="h-3.5 w-3.5" /> {t('tunnels.tokenActive')}
        </div>
      </div>

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

      {showTunnelModal && (
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
      )}

      {showProfileModal && (
        <ProfileModal
          form={profileForm}
          setForm={setProfileForm}
          onClose={() => { setShowProfileModal(false); setProfileForm(emptyProfileForm) }}
          onSubmit={() => createProfileMut.mutate()}
          pending={createProfileMut.isPending}
        />
      )}
    </div>
  )
}

function CloudflareSplit({
  leftTitle,
  leftSubtitle,
  rightTitle,
  rightSubtitle,
  leftSearch,
  onLeftSearch,
  rightSearch,
  onRightSearch,
  leftPlaceholder,
  rightPlaceholder,
  leftLoading,
  rightLoading,
  emptyLeft,
  emptyRight,
  leftItems,
  rightItems,
  rightTopSlot,
}: {
  leftTitle: string
  leftSubtitle: string
  rightTitle: string
  rightSubtitle: string
  leftSearch: string
  onLeftSearch: (value: string) => void
  rightSearch: string
  onRightSearch: (value: string) => void
  leftPlaceholder: string
  rightPlaceholder: string
  leftLoading: boolean
  rightLoading: boolean
  emptyLeft: string
  emptyRight: string
  leftItems: React.ReactNode[]
  rightItems: React.ReactNode[]
  rightTopSlot?: React.ReactNode
}) {
  const { t } = useI18n()

  return (
    <div className="cloudflare-workspace">
      <section className="cloudflare-pane cloudflare-pane--nav">
        <PaneHeader title={leftTitle} subtitle={leftSubtitle} search={leftSearch} onSearch={onLeftSearch} placeholder={leftPlaceholder} />
        <div className="cloudflare-pane__list">
          {leftLoading ? <LoadingState text={t('tunnels.loadingData')} /> : leftItems.length ? leftItems : <Empty text={emptyLeft} />}
        </div>
      </section>
      <section className="cloudflare-pane cloudflare-pane--detail">
        <PaneHeader title={rightTitle} subtitle={rightSubtitle} search={rightSearch} onSearch={onRightSearch} placeholder={rightPlaceholder} topSlot={rightTopSlot} />
        <div className="cloudflare-pane__content">
          {rightLoading ? <LoadingState text={t('tunnels.loadingDetail')} /> : rightItems.length ? rightItems : <Empty text={emptyRight} />}
        </div>
      </section>
    </div>
  )
}

function PaneHeader({ title, subtitle, search, onSearch, placeholder, topSlot }: { title: string; subtitle: string; search: string; onSearch: (value: string) => void; placeholder: string; topSlot?: React.ReactNode }) {
  return (
    <div className="cloudflare-pane__header">
      {topSlot ? <div className="cloudflare-pane__top-slot">{topSlot}</div> : null}
      <div className="min-w-0">
        <div className="cloudflare-pane__title">{title}</div>
        <div className="cloudflare-pane__subtitle">{subtitle}</div>
      </div>
      <label className="panel-search cloudflare-pane__search">
        <Search className="h-4 w-4" />
        <input value={search} onChange={(e) => onSearch(e.target.value)} className="panel-search__input" placeholder={placeholder} />
      </label>
    </div>
  )
}

function LoadingState({ text }: { text: string }) {
  const { t } = useI18n()

  return (
    <div className="cloudflare-loading-state" role="status" aria-live="polite">
      <div className="cloudflare-loading-state__orb">
        <span />
      </div>
      <div className="cloudflare-loading-state__content">
        <strong>{text}</strong>
        <p>{t('tunnels.loadingHint')}</p>
      </div>
      <div className="cloudflare-loading-state__bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="panel-empty cloudflare-empty"><Layers3 className="h-8 w-8" /><span>{text}</span></div>
}

function DomainRow({ domain, active, onClick, onDelete, deleting }: { domain: CloudflareDomain; active: boolean; onClick: () => void; onDelete: () => void; deleting: boolean }) {
  const { t } = useI18n()
  return (
    <div className={`cloudflare-row cloudflare-row--with-action ${active ? 'is-active' : ''}`}>
      <button type="button" onClick={onClick} className="cloudflare-row__select">
        <div className="cloudflare-row__icon"><Globe2 className="h-4 w-4" /></div>
        <div className="cloudflare-row__body">
          <div className="cloudflare-row__title">{domain.name}</div>
          <div className="cloudflare-row__meta">Zone ID: {domain.id}</div>
        </div>
      </button>
      <button type="button" onClick={onDelete} disabled={deleting} className="panel-icon-btn panel-icon-btn--danger" title={t('tunnels.deleteDomainTitle')}>
        {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function ProfileRow({ profile, active, onClick, onDelete, deleting }: { profile: CloudflareTunnelProfile; active: boolean; onClick: () => void; onDelete: () => void; deleting: boolean }) {
  const { t } = useI18n()
  const sc = STATUS_CONFIG[profile.status] ?? { variant: 'panel-status--neutral', labelKey: 'tunnels.status.unknown' }
  return (
    <div className={`cloudflare-row cloudflare-row--with-action cloudflare-profile-row ${active ? 'is-active' : ''}`}>
      <button type="button" onClick={onClick} className="cloudflare-row__select cloudflare-profile-row__select">
        <div className="cloudflare-row__icon"><Network className="h-4 w-4" /></div>
        <div className="cloudflare-row__body">
          <div className="cloudflare-profile-row__title-line">
            <span className="cloudflare-row__title">{profile.name}</span>
            <span className={`panel-badge ${sc.variant}`}>{t(sc.labelKey)}</span>
          </div>
          <div className="cloudflare-profile-row__meta-grid">
            <span>{profile.routeCount === 1 ? t('tunnels.routeCount', { count: profile.routeCount }) : t('tunnels.routesCount', { count: profile.routeCount })}</span>
            <span>{profile.daemonRunning ? t('tunnels.daemonRunning') : t('tunnels.daemonIdle')}</span>
            <span title={profile.id}>ID {profile.id.slice(0, 8)}...</span>
          </div>
        </div>
      </button>
      <button type="button" onClick={onDelete} disabled={deleting || profile.id === 'pending'} className="panel-icon-btn panel-icon-btn--danger" title={t('tunnels.deleteProfileTitle')}>
        {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function DNSRow({ record, onEdit, onDelete }: { record: CloudflareDNSRecord; onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  return (
    <div className="cloudflare-detail-row">
      <div className="cloudflare-detail-row__main">
        <div className="cloudflare-detail-row__title">
          <span className="panel-badge panel-badge--info">{record.type}</span>
          <span className="truncate font-semibold text-[var(--win-text)]">{record.name}</span>
          {record.proxied && <span className="panel-badge panel-badge--warning">{t('tunnels.proxied')}</span>}
        </div>
        <div className="cloudflare-detail-row__meta">{record.content} • TTL {record.ttl === 1 ? t('tunnels.auto') : record.ttl}</div>
      </div>
      <RowActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

function TunnelCard({ tunnel: t, onEdit, onDelete, onSync, isSyncing }: { tunnel: Tunnel; onEdit: () => void; onDelete: () => void; onSync: () => void; isSyncing: boolean }) {
  const { t: translate } = useI18n()
  const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.inactive
  const copyHostname = async () => {
    if (!t.cfHostname) return
    try {
      await navigator.clipboard.writeText(`https://${t.cfHostname}`)
      toast.success(translate('tunnels.hostnameCopied'))
    } catch {
      toast.error(translate('tunnels.hostnameCopyFailed'))
    }
  }

  return (
    <div className="cloudflare-detail-row">
      <div className="cloudflare-detail-row__main">
        <div className="cloudflare-detail-row__title">
          <span className="tunnel-flat-row__name">{t.name}</span>
          <span className={`panel-badge ${sc.variant}`}><span className="panel-status-dot" />{translate(sc.labelKey)}</span>
          {t.status === 'active' && <span className="panel-badge panel-badge--success"><CheckCircle2 className="h-3 w-3" />{translate('tunnels.live')}</span>}
          {t.status === 'creating' && <span className="panel-badge panel-badge--warning"><Clock className="h-3 w-3 animate-spin" />{translate('tunnels.provisioning')}</span>}
        </div>
        <div className="cloudflare-detail-row__meta cloudflare-route-line">
          {t.cfHostname ? (
            <>
              <span className="tunnel-flat-row__hostname">{t.cfHostname}</span>
              <button onClick={copyHostname} className="panel-icon-btn h-5 w-5" title={translate('tunnels.copy')}><Copy className="h-3 w-3" /></button>
              <a href={`https://${t.cfHostname}`} target="_blank" rel="noopener noreferrer" className="panel-icon-btn h-5 w-5"><ExternalLink className="h-3 w-3" /></a>
              <span className="tunnel-flat-row__arrow">→</span>
              <span className="tunnel-flat-row__target">{t.targetUrl}</span>
            </>
          ) : (
            <>
              <span className="tunnel-flat-row__pending">{translate('tunnels.hostnamePending')}</span>
              <span className="tunnel-flat-row__arrow">→</span>
              <span className="tunnel-flat-row__target">{t.targetUrl}</span>
            </>
          )}
        </div>
      </div>
      <div className="tunnel-flat-row__actions">
        {t.status === 'active' && (
          <button onClick={onSync} disabled={isSyncing} className="panel-icon-btn panel-icon-btn--primary" title={translate('common.sync')}>
            <RefreshCcw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  return (
    <>
      <button onClick={onEdit} className="panel-icon-btn" title={t('common.edit')}><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDelete} className="panel-icon-btn panel-icon-btn--danger" title={t('common.delete')}><Trash2 className="h-3.5 w-3.5" /></button>
    </>
  )
}

function DNSModal({ form, setForm, editing, onClose, onSubmit, pending }: { form: DnsForm; setForm: React.Dispatch<React.SetStateAction<DnsForm>>; editing: boolean; onClose: () => void; onSubmit: () => void; pending: boolean }) {
  const { t } = useI18n()
  return (
    <div className="panel-modal-overlay">
      <div className="panel-modal-card cloudflare-modal-card">
        <h3 className="mb-1 text-sm font-semibold text-[var(--win-text)]">{editing ? t('tunnels.dnsEditTitle') : t('tunnels.dnsCreateTitle')}</h3>
        <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.dnsModalSubtitle')}</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="panel-section-label">{t('tunnels.type')}</label><PanelSelectMenu id="dns-type" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={DNS_TYPES.map((t) => ({ value: t, label: t }))} /></div>
            <div><label className="panel-section-label">TTL</label><input className="panel-input" type="number" value={form.ttl} onChange={(e) => setForm((f) => ({ ...f, ttl: Number(e.target.value) }))} /></div>
          </div>
          <div><label className="panel-section-label">{t('tunnels.name')}</label><input className="panel-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('tunnels.dnsNamePlaceholder')} /></div>
          <div><label className="panel-section-label">{t('tunnels.content')}</label><input className="panel-input" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder={t('tunnels.dnsContentPlaceholder')} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="panel-section-label">{t('tunnels.priority')}</label><input className="panel-input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} placeholder={t('tunnels.priorityPlaceholder')} /></div>
            <label className="cloudflare-checkbox"><input type="checkbox" checked={form.proxied} onChange={(e) => setForm((f) => ({ ...f, proxied: e.target.checked }))} /> {t('tunnels.proxied')}</label>
          </div>
          <div><label className="panel-section-label">{t('tunnels.comment')}</label><input className="panel-input" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} placeholder={t('tunnels.optional')} /></div>
        </div>
        <div className="mt-5 flex gap-2"><button onClick={onClose} className="panel-btn panel-btn--ghost flex-1">{t('common.cancel')}</button><button onClick={onSubmit} disabled={pending || !form.type || !form.name || !form.content} className="panel-btn panel-btn--primary flex-1">{pending ? t('tunnels.saving') : t('tunnels.saveDns')}</button></div>
      </div>
    </div>
  )
}

function DomainStatusPanel({ domain, onCheckStatus, checkingStatus, onDelete, deleting }: { domain: CloudflareDomain; onCheckStatus: () => void; checkingStatus: boolean; onDelete: () => void; deleting: boolean }) {
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
          <button type="button" className="panel-btn panel-btn--primary-soft cloudflare-domain-status-panel__check" onClick={onCheckStatus} disabled={checkingStatus}>
            <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
            {checkingStatus ? t('tunnels.checking') : t('tunnels.checkStatus')}
          </button>
          <button type="button" onClick={onDelete} disabled={deleting} className="panel-icon-btn panel-icon-btn--danger" title={t('tunnels.deleteDomainTitle')}>
            {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
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

function DomainModal({ form, setForm, createdDomain, onClose, onSubmit, pending, onCheckStatus, checkingStatus }: { form: DomainForm; setForm: React.Dispatch<React.SetStateAction<DomainForm>>; createdDomain: CloudflareDomain | null; onClose: () => void; onSubmit: () => void; pending: boolean; onCheckStatus: () => void; checkingStatus: boolean }) {
  const { t } = useI18n()
  return (
    <div className="panel-modal-overlay">
      <div className="panel-modal-card cloudflare-modal-card">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]"><Globe2 className="panel-window__icon h-4 w-4" />{t('tunnels.addDomainTitle')}</h3>
        <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.addDomainSubtitle')}</p>
        <div className="space-y-4">
          <div><label className="panel-section-label">{t('tunnels.domainRequired')}</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="panel-input" placeholder={t('tunnels.domainPlaceholder')} /></div>
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
                <button type="button" className="panel-btn panel-btn--primary" onClick={onCheckStatus} disabled={checkingStatus}>
                  <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                  {checkingStatus ? t('tunnels.checkingDomainStatus') : t('tunnels.checkDomainConnection')}
                </button>
              </div>

              <p className="cloudflare-domain-success__note">
                {t('tunnels.domainPropagationNote')}
              </p>
            </div>
          )}
        </div>
        <div className="mt-5 flex gap-2"><button onClick={onClose} className="panel-btn panel-btn--ghost flex-1">{t('common.close')}</button><button onClick={onSubmit} disabled={pending || !form.name || !!createdDomain} className="panel-btn panel-btn--primary flex-1">{pending ? t('tunnels.connecting') : t('tunnels.addDomain')}</button></div>
      </div>
    </div>
  )
}

function ProfileModal({ form, setForm, onClose, onSubmit, pending }: { form: ProfileForm; setForm: React.Dispatch<React.SetStateAction<ProfileForm>>; onClose: () => void; onSubmit: () => void; pending: boolean }) {
  const { t } = useI18n()
  return (
    <div className="panel-modal-overlay">
      <div className="panel-modal-card cloudflare-modal-card">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]"><Network className="panel-window__icon h-4 w-4" />{t('tunnels.profileCreateTitle')}</h3>
        <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.profileCreateSubtitle')}</p>
        <div className="space-y-4">
          <div><label className="panel-section-label">{t('tunnels.profileName')}</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="panel-input" placeholder={t('tunnels.profileNamePlaceholder')} /></div>
          <div><label className="panel-section-label">{t('tunnels.mode')}</label><PanelSelectMenu id="profile-mode" value={form.mode} onChange={(v) => setForm((f) => ({ ...f, mode: v as 'managed' | 'custom' }))} options={[{ value: 'managed', label: t('tunnels.managedByPanel') }, { value: 'custom', label: t('tunnels.customExistingTunnel') }]} /></div>
          {form.mode === 'custom' && <div><label className="panel-section-label">{t('tunnels.existingTunnelId')}</label><input value={form.tunnelId} onChange={(e) => setForm((f) => ({ ...f, tunnelId: e.target.value }))} className="panel-input" placeholder={t('tunnels.tunnelIdPlaceholder')} /></div>}
        </div>
        <div className="mt-5 flex gap-2"><button onClick={onClose} className="panel-btn panel-btn--ghost flex-1">{t('common.cancel')}</button><button onClick={onSubmit} disabled={pending || (form.mode === 'custom' && !form.tunnelId)} className="panel-btn panel-btn--primary flex-1">{pending ? t('tunnels.creating') : t('tunnels.createProfile')}</button></div>
      </div>
    </div>
  )
}

function TunnelModal({ form, setForm, editing, zoneOptions, cfZones, protocolOptions, profileOptions, projectOptions, projects, onClose, onSubmit, pending }: { form: TunnelForm; setForm: React.Dispatch<React.SetStateAction<TunnelForm>>; editing: boolean; zoneOptions: { value: string; label: string }[]; cfZones: { id: string; name: string }[]; protocolOptions: { value: string; label: string }[]; profileOptions: { value: string; label: string }[]; projectOptions: { value: string; label: string; description?: string }[]; projects: Project[]; onClose: () => void; onSubmit: () => void; pending: boolean }) {
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
    <div className="panel-modal-overlay">
      <div className="panel-modal-card cloudflare-modal-card">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]"><Network className="panel-window__icon h-4 w-4" />{editing ? t('tunnels.routeEditTitle') : t('tunnels.routeNewTitle')}</h3>
        <p className="mb-4 text-[12px] text-[var(--text-secondary)]">{t('tunnels.routeModalSubtitle')}</p>
        <div className="space-y-4">
          {!editing && <div><label className="panel-section-label">{t('tunnels.tunnelProfileRequired')}</label><PanelSelectMenu id="route-profile-select" value={form.profileId} onChange={(v) => setForm((f) => ({ ...f, profileId: v }))} options={profileOptions} searchable /></div>}
          <div><label className="panel-section-label">Project sumber</label><PanelSelectMenu id="route-project-select" value={form.projectId} onChange={selectProject} options={projectOptions} searchable /></div>
          <div><label className="panel-section-label">{t('tunnels.routeNameRequired')}</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="panel-input" placeholder={t('tunnels.routeNamePlaceholder')} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="panel-section-label">{t('tunnels.subdomain')}</label><input value={form.subdomain} onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value }))} className="panel-input" placeholder={t('tunnels.subdomainPlaceholder')} /></div>
            <div><label className="panel-section-label">{t('tunnels.domainRequiredShort')}</label><PanelSelectMenu id="tunnel-zone-select" value={form.zoneId} onChange={(v) => { const selected = cfZones.find((z) => z.id === v); setForm((f) => ({ ...f, zoneId: v, domain: selected?.name || '' })) }} options={zoneOptions} searchable /></div>
          </div>
          <div><label className="panel-section-label">{t('tunnels.path')}</label><input value={form.path} onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} className="panel-input" placeholder={t('tunnels.pathPlaceholder')} /></div>
          <div>
            <label className="panel-section-label">{t('tunnels.targetUrlRequired')}</label>
            <div className="flex items-center gap-2">
              <PanelSelectMenu id="tunnel-protocol-select" value={form.protocol} onChange={(v) => setForm((f) => ({ ...f, protocol: v }))} options={protocolOptions} buttonClassName="!w-28" />
              <input value={form.ip} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} className="panel-input flex-1" placeholder={t('tunnels.ipPlaceholder')} />
              <span className="text-[var(--text-secondary)]">:</span>
              <input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} className="panel-input !w-24" placeholder={t('tunnels.portPlaceholder')} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-2"><button onClick={onClose} className="panel-btn panel-btn--ghost flex-1">{t('common.cancel')}</button><button onClick={onSubmit} disabled={pending || !form.name || !form.zoneId || !form.ip || !form.port || (!editing && !form.profileId)} className="panel-btn panel-btn--primary flex-1">{pending ? t('tunnels.saving') : t('tunnels.saveRoute')}</button></div>
      </div>
    </div>
  )
}




