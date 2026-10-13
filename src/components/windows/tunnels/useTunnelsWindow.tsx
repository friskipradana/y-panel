import { useEffect, useMemo, useState } from 'react'
import { type WindowState } from '@/types'
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
  type Tunnel,
} from '@/api/agent'
import { alertLib } from '@/lib/alert'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import {
  emptyDnsForm,
  emptyTunnelForm,
  emptyDomainForm,
  emptyProfileForm,
  type DnsForm,
  type TunnelForm,
  type DomainForm,
  type ProfileForm,
  buildTunnelFormFromTunnel,
  slugifyRoutePart,
  tunnelPayload,
} from './tunnelForms'

export function useTunnelsWindow({ win }: { win?: WindowState }) {
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

  return {
    t,
    tab,
    setTab,
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
    showDnsModal,
    setShowDnsModal,
    showDomainModal,
    setShowDomainModal,
    createdDomain,
    editingDns,
    dnsForm,
    setDnsForm,
    domainForm,
    setDomainForm,
    showTunnelModal,
    showProfileModal,
    setShowProfileModal,
    editingTunnelId,
    tunnelForm,
    setTunnelForm,
    profileForm,
    setProfileForm,
    cfNotConfigured,
    cfZones,
    domainsLoading,
    refetchDomains,
    domainsFetching,
    dnsLoading,
    profilesLoading,
    refetchProfiles,
    profilesFetching,
    routesLoading,
    safeCfZones,
    safeDomains,
    safeDnsRecords,
    safeProfiles,
    safeProfileRoutes,
    selectedDomain,
    selectedProfile,
    filteredDomains,
    filteredDns,
    filteredProfiles,
    filteredRoutes,
    zoneOptions,
    protocolOptions,
    profileOptions,
    tunnelProjects,
    projectOptions,
    createDomainMut,
    checkCreatedDomainMut,
    createDnsMut,
    updateDnsMut,
    deleteDnsMut,
    deleteDomainMut,
    createProfileMut,
    deleteProfileMut,
    createTunnelMut,
    updateTunnelMut,
    deleteTunnelMut,
    syncMut,
    openDnsModal,
    closeTunnelModal,
    closeDomainModal,
    openTunnelModal,
    handleSync,
  }
}

export type TunnelsWindowState = ReturnType<typeof useTunnelsWindow>
