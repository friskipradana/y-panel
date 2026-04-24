import {
  useContainers,
  useStartContainer,
  useStopContainer,
  useRestartContainer,
  useDeleteContainer,
  useDeployImageContainer,
  useDeployComposeProject,
  useDockerNetworks,
  useDockerImages,
  useDockerTemplates,
  useCreateDockerNetwork,
  useDeleteDockerNetwork,
  useDeleteDockerImage,
  usePullDockerImage,
  useDeleteDockerTemplate,
  useCreateDockerTemplate,
} from '@/hooks/useContainers'
import { fetchContainerConfig } from '@/api/agent'
import { useEffect, useMemo, useRef, useState } from 'react'
import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import {
  Activity,
  Boxes,
  Container as ContainerIcon,
  Play,
  RefreshCw,
  Search,
  Square,
  Layers3,
  Server,
  Plus,
  Trash2,
  RefreshCcw,
  Box,
  Code,
  X,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from 'lucide-react'
import type { Container, DockerEnvMode, EnvVarInput } from '@/types'

// const APP_ICONS: Record<string, string> = {
//   grafana: '📊',
//   portainer: '🐋',
//   uptime: '💓',
//   jellyfin: '🎬',
//   nextcloud: '☁️',
//   nginx: '🌐',
//   postgres: '🐘',
//   redis: '⚡',
//   default: '📦',
// }

// function getIcon(name: string): string {
//   const lower = name.toLowerCase()
//   return Object.entries(APP_ICONS).find(([k]) => lower.includes(k))?.[1] ?? APP_ICONS.default
// }

const STATE_STYLES: Record<Container['State'], { badge: string; btn: string; btnText: string; actionIcon: typeof Play }> = {
  running: { badge: 'panel-badge--success', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  exited: { badge: 'panel-badge--danger', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  paused: { badge: 'panel-badge--warning', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  restarting: { badge: 'panel-badge--info', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  dead: { badge: 'panel-badge--neutral', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
}

const EMPTY_ENV_ROW: EnvVarInput = { key: '', value: '' }
const DEFAULT_COMPOSE_YAML = 'version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n'

function createEmptyRegistryAuth() {
  return {
    enabled: false,
    registry: '',
    usernameOrEmail: '',
    password: '',
  }
}

function createDefaultDeployForm() {
  return {
    ownerUserId: 0,
    network: '',
    name: '',
    image: '',
    ports: [{ hostPort: '', containerPort: '' }],
    env: [EMPTY_ENV_ROW],
    envMode: 'form' as DockerEnvMode,
    envRaw: '',
    registryAuth: createEmptyRegistryAuth(),
    volumes: [{ hostPath: '', containerPath: '' }],
    composeYaml: DEFAULT_COMPOSE_YAML,
  }
}

function createDefaultPullImageForm() {
  return {
    image: '',
    registryAuth: createEmptyRegistryAuth(),
  }
}

function toRawEnv(env: EnvVarInput[]) {
  return env
    .filter((item) => item.key.trim())
    .map((item) => `${item.key}=${item.value}`)
    .join('\n')
}

function toEnvRows(raw: string) {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=')
      if (idx === -1) {
        return { key: line, value: '' }
      }
      return {
        key: line.slice(0, idx).trim(),
        value: line.slice(idx + 1),
      }
    })
    .filter((item) => item.key)

  return rows.length > 0 ? rows : [EMPTY_ENV_ROW]
}

function StatusBadge({ state }: { state: Container['State'] }) {
  const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.dead
  return (
    <span className={`panel-badge ${stateStyle.badge}`}>
      <span className="panel-status-dot" />
      {state}
    </span>
  )
}


function getContainerPorts(container: Container) {
  const ports = Array.isArray(container.Ports) ? container.Ports : []
  const published = Array.from(
    new Set(
      ports
        .filter((port) => port.PublicPort)
        .map((port) => `${port.PublicPort}->${port.PrivatePort}/${port.Type}`),
    ),
  )

  const internal = Array.from(new Set(ports.map((port) => `${port.PrivatePort}/${port.Type}`)))

  return {
    published,
    internal,
    primaryPublished: published[0] ?? 'Tidak ada port forward',
    primaryInternal: internal[0] ?? 'Tidak terdeteksi',
  }
}

function MetaChip({ label, value, tone = 'neutral' }: { label?: string; value: string; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'info' }) {
  return (
    <span className={`docker-meta-chip docker-meta-chip--${tone}`}>
      {label ? <span className="docker-meta-chip__label">{label}</span> : null}
      <span className="docker-meta-chip__value">{value}</span>
    </span>
  )
}

function DeployStep({ label, delay }: { label: string; delay: number }) {
  const [visible, setVisible] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), delay)
    const t2 = setTimeout(() => setDone(true), delay + 900)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [delay])

  if (!visible) return null

  return (
    <div className={`docker-deploy-step ${done ? 'docker-deploy-step--done' : 'docker-deploy-step--active'}`}>
      <span className="docker-deploy-step__dot">
        {done ? (
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="docker-deploy-step__check">
            <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="docker-deploy-step__pulse" />
        )}
      </span>
      <span className="docker-deploy-step__label">{label}</span>
    </div>
  )
}

export function DockerWindow({ authenticated }: { authenticated?: boolean }) {
  const [activeTab, setActiveTab] = useState<'containers' | 'images' | 'networks' | 'templates'>('containers')
  const { data, isLoading, isError, error, refetch, isFetching } = useContainers()
  const { data: networksData, refetch: refetchNetworks } = useDockerNetworks()
  const { data: imagesData, refetch: refetchImages } = useDockerImages()
  const { data: templatesData, refetch: refetchTemplates } = useDockerTemplates()

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')

  // Images tab state
  const [imgSearch, setImgSearch] = useState('')
  const [imgPage, setImgPage] = useState(1)
  const IMG_PAGE_SIZE = 10

  // Networks tab state
  const [netSearch, setNetSearch] = useState('')
  const [showCreateNet, setShowCreateNet] = useState(false)
  const [netForm, setNetForm] = useState({ name: '', subnet: '', gateway: '' })

  // Templates tab state
  const [tplSearch, setTplSearch] = useState('')
  const [showCreateTpl, setShowCreateTpl] = useState(false)
  const [tplForm, setTplForm] = useState({ name: '', description: '', yamlContent: 'version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n' })

  const [showDeploy, setShowDeploy] = useState(false)
  const [showPullImage, setShowPullImage] = useState(false)
  const [showSaveAsTpl, setShowSaveAsTpl] = useState(false)
  const [imgDropdownOpen, setImgDropdownOpen] = useState(false)
  const [imgInputValue, setImgInputValue] = useState('')
  // const [showTplPicker, setShowTplPicker] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const [netDropdownOpen, setNetDropdownOpen] = useState(false)
  const [netInputValue, setNetInputValue] = useState('')
  const [pullImageForm, setPullImageForm] = useState(createDefaultPullImageForm)

  // Refs for click-outside to close dropdowns
  const imgComboRef = useRef<HTMLDivElement>(null)
  const nameComboRef = useRef<HTMLDivElement>(null)
  const netComboRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (imgComboRef.current && !imgComboRef.current.contains(e.target as Node)) setImgDropdownOpen(false)
      if (nameComboRef.current && !nameComboRef.current.contains(e.target as Node)) setNameDropdownOpen(false)
      if (netComboRef.current && !netComboRef.current.contains(e.target as Node)) setNetDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; image: string } | null>(null)
  const [deleteOpts, setDeleteOpts] = useState({ removeVolumes: false, removeImage: false })
  const [editContainer, setEditContainer] = useState<{ id: string } | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deployType, setDeployType] = useState<'image' | 'compose'>('image')
  const [deployForm, setDeployForm] = useState(createDefaultDeployForm)

  useEffect(() => {
    if (authenticated) {
      void refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const resetDeployModal = () => {
    setShowDeploy(false)
    setEditContainer(null)
    setDeployType('image')
    setDeployForm(createDefaultDeployForm())
    setImgInputValue('')
    setNetInputValue('')
    setImgDropdownOpen(false)
    setNameDropdownOpen(false)
    setNetDropdownOpen(false)
    setShowSaveAsTpl(false)
  }

  const openDeployModal = () => {
    resetDeployModal()
    setShowDeploy(true)
  }

  const resetPullImageModal = () => {
    setShowPullImage(false)
    setPullImageForm(createDefaultPullImageForm())
  }

  const startMutation = useStartContainer()
  const stopMutation = useStopContainer()
  const restartMutation = useRestartContainer()
  const deleteMutation = useDeleteContainer()

  const deployImageMut = useDeployImageContainer()
  const deployComposeMut = useDeployComposeProject()

  const createNetworkMut = useCreateDockerNetwork()
  const deleteNetworkMut = useDeleteDockerNetwork()
  const pullImageMut = usePullDockerImage()
  const deleteImageMut = useDeleteDockerImage()
  const deleteTemplateMut = useDeleteDockerTemplate()
  const createTemplateMut = useCreateDockerTemplate()

  const rawContainers = Array.isArray(data) ? data : []
  const containers = useMemo(() => {
    return rawContainers.filter((container) => {
      const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
      return !name.toLowerCase().includes('portainer') && !container.Image.toLowerCase().includes('portainer')
    })
  }, [rawContainers])

  const filteredContainers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return containers
    return containers.filter((container) => {
      const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
      const networks = (container.Networks ?? []).join(' ')
      const ips = (container.IpAddresses ?? []).join(' ')
      const ports = (container.Ports ?? []).map((port) => `${port.PublicPort ?? ''} ${port.PrivatePort} ${port.Type}`).join(' ')
      return [name, container.Image, container.State, container.Status, container.Id, networks, ips, ports]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [containers, search])

  const stats = useMemo(() => {
    const running = containers.filter((container) => container.State === 'running').length
    const stopped = containers.filter((container) => ['exited', 'dead'].includes(container.State)).length
    const attention = containers.filter((container) => ['paused', 'restarting'].includes(container.State)).length
    const withPublishedPorts = containers.filter((container) => (container.Ports ?? []).some((port) => port.PublicPort)).length
    const withIPs = containers.filter((container) => (container.IpAddresses ?? []).length > 0).length
    return { running, stopped, attention, withPublishedPorts, withIPs }
  }, [containers])

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Boxes className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Docker Workspace</div>
            <div className="panel-window__meta">Manage your docker resources</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button type="button" onClick={() => {
            void refetch(); void refetchNetworks(); void refetchImages(); void refetchTemplates()
          }} className="panel-icon-btn" aria-label="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => {
            openDeployModal()
          }} className="panel-btn panel-btn--primary-soft">
            <Plus className="h-3.5 w-3.5" />
            Deploy
          </button>
        </div>
      </div>

      <div className="docker-tabs">
        <button className={`docker-tab ${activeTab === 'containers' ? 'docker-tab--active' : ''}`} onClick={() => setActiveTab('containers')}>Containers</button>
        <button className={`docker-tab ${activeTab === 'images' ? 'docker-tab--active' : ''}`} onClick={() => setActiveTab('images')}>Images</button>
        <button className={`docker-tab ${activeTab === 'networks' ? 'docker-tab--active' : ''}`} onClick={() => setActiveTab('networks')}>Networks</button>
        <button className={`docker-tab ${activeTab === 'templates' ? 'docker-tab--active' : ''}`} onClick={() => setActiveTab('templates')}>Templates</button>
      </div>

      {showDeploy && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card" style={{ width: 'min(100%, 840px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              {editContainer ? <Pencil className="panel-window__icon h-4 w-4" /> : <Boxes className="panel-window__icon h-4 w-4" />}
              {editContainer ? 'Edit & Re-deploy Container' : 'Deploy Container'}
            </h3>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1" style={{ overflowX: 'visible' }}>
              {/* Deployment Type Tabs */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDeployType('image')}
                  className={`panel-btn justify-center py-2 text-[12px] font-medium shadow-none ${deployType === 'image' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
                >
                  <Box className="h-4 w-4" /> Deploy from Image
                </button>
                <button
                  onClick={() => setDeployType('compose')}
                  className={`panel-btn justify-center py-2 text-[12px] font-medium shadow-none ${deployType === 'compose' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
                >
                  <Code className="h-4 w-4" /> Deploy from Compose
                </button>
              </div>

              {/* Project / Container Name — combobox */}
              <div>
                <label className="panel-section-label">Project / Container Name *</label>
                <div className="docker-image-combobox" ref={nameComboRef}>
                  <div className="docker-image-combobox__input-wrap">
                    <input
                      value={deployForm.name}
                      onChange={(e) => !editContainer && setDeployForm({ ...deployForm, name: e.target.value })}
                      onFocus={() => { if (!editContainer) { setNameDropdownOpen(true); setImgDropdownOpen(false); setNetDropdownOpen(false) } }}
                      placeholder="my-awesome-app"
                      className={`panel-input docker-image-combobox__input ${editContainer ? 'opacity-60 cursor-not-allowed' : ''}`}
                      autoComplete="off"
                      readOnly={!!editContainer}
                    />
                    {deployForm.name && !editContainer && (
                      <button type="button" className="docker-image-combobox__clear" onClick={() => { setDeployForm({ ...deployForm, name: '' }); setNameDropdownOpen(false) }} title="Hapus">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {(deployType === 'compose' ? (templatesData?.items?.length ?? 0) : 0) > 0 && (
                      <button type="button" className="docker-image-combobox__toggle" onClick={() => { setNameDropdownOpen((v) => !v); setImgDropdownOpen(false); setNetDropdownOpen(false) }}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {nameDropdownOpen && deployType === 'compose' && (templatesData?.items?.length ?? 0) > 0 && (
                    <div className="docker-image-combobox__dropdown">
                      {(templatesData?.items ?? [])
                        .filter((t) => !deployForm.name || t.name.toLowerCase().includes(deployForm.name.toLowerCase()))
                        .map((tmpl) => (
                          <button
                            key={tmpl.id}
                            type="button"
                            className={`docker-image-combobox__item ${deployForm.name === tmpl.name ? 'docker-image-combobox__item--selected' : ''}`}
                            onClick={() => {
                              setDeployForm((f) => ({ ...f, name: tmpl.name, composeYaml: tmpl.yamlContent }))
                              setNameDropdownOpen(false)
                            }}
                          >
                            <span className="docker-image-combobox__item-name">{tmpl.name}</span>
                            {tmpl.description && <span className="docker-image-combobox__item-size">{tmpl.description}</span>}
                            {deployForm.name === tmpl.name && <Check className="h-3.5 w-3.5 ml-auto" />}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {deployType === 'image' ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="panel-section-label">Docker Image *</label>
                      <div className="docker-image-combobox" ref={imgComboRef}>
                        <div className="docker-image-combobox__input-wrap">
                          <input
                            value={deployForm.image}
                            onChange={(e) => { setDeployForm({ ...deployForm, image: e.target.value }); setImgInputValue(e.target.value) }}
                            onFocus={() => { setImgDropdownOpen(true); setNameDropdownOpen(false); setNetDropdownOpen(false) }}
                            placeholder="nginx:latest atau pilih dari list..."
                            className="panel-input docker-image-combobox__input"
                            autoComplete="off"
                          />
                          {deployForm.image && (
                            <button type="button" className="docker-image-combobox__clear" onClick={() => { setDeployForm({ ...deployForm, image: '' }); setImgInputValue(''); setImgDropdownOpen(false) }} title="Hapus">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          <button type="button" className="docker-image-combobox__toggle" onClick={() => { setImgDropdownOpen((v) => !v); setNameDropdownOpen(false); setNetDropdownOpen(false) }}>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {imgDropdownOpen && (imagesData?.items?.length ?? 0) > 0 && (
                          <div className="docker-image-combobox__dropdown">
                            {(imagesData?.items ?? [])
                              .filter((img) => !imgInputValue || `${img.Repository}:${img.Tag}`.toLowerCase().includes(imgInputValue.toLowerCase()))
                              .map((img) => {
                                const val = `${img.Repository}:${img.Tag}`
                                return (
                                  <button
                                    key={img.Id}
                                    type="button"
                                    className={`docker-image-combobox__item ${deployForm.image === val ? 'docker-image-combobox__item--selected' : ''}`}
                                    onClick={() => { setDeployForm({ ...deployForm, image: val }); setImgInputValue(val); setImgDropdownOpen(false) }}
                                  >
                                    <span className="docker-image-combobox__item-name">{img.Repository}</span>
                                    <span className="panel-badge panel-badge--neutral">{img.Tag}</span>
                                    <span className="docker-image-combobox__item-size">{img.Size}</span>
                                    {deployForm.image === val && <Check className="h-3.5 w-3.5 ml-auto" />}
                                  </button>
                                )
                              })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Registry Authentication */}
                    <div className="docker-auth-block">
                      <label className="docker-save-tpl-check">
                        <input
                          type="checkbox"
                          checked={deployForm.registryAuth.enabled}
                          onChange={(e) => setDeployForm((current) => ({
                            ...current,
                            registryAuth: {
                              ...current.registryAuth,
                              enabled: e.target.checked,
                            },
                          }))}
                        />
                        <span>Gunakan autentikasi registry</span>
                      </label>
                      {deployForm.registryAuth.enabled && (
                        <div className="docker-auth-grid">
                          <div className="panel-field">
                            <label className="panel-label">Registry <span className="docker-field-optional">opsional</span></label>
                            <input
                              className="panel-input"
                              placeholder="docker.io atau ghcr.io"
                              value={deployForm.registryAuth.registry}
                              onChange={(e) => setDeployForm((current) => ({
                                ...current,
                                registryAuth: { ...current.registryAuth, registry: e.target.value },
                              }))}
                            />
                          </div>
                          <div className="panel-field">
                            <label className="panel-label">Username / Email *</label>
                            <input
                              className="panel-input"
                              placeholder="username atau email registry"
                              value={deployForm.registryAuth.usernameOrEmail}
                              onChange={(e) => setDeployForm((current) => ({
                                ...current,
                                registryAuth: { ...current.registryAuth, usernameOrEmail: e.target.value },
                              }))}
                            />
                          </div>
                          <div className="panel-field docker-auth-grid__full">
                            <label className="panel-label">Password *</label>
                            <input
                              type="password"
                              className="panel-input"
                              placeholder="••••••••"
                              value={deployForm.registryAuth.password}
                              onChange={(e) => setDeployForm((current) => ({
                                ...current,
                                registryAuth: { ...current.registryAuth, password: e.target.value },
                              }))}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Network combobox */}
                    <div>
                      <label className="panel-section-label">Network</label>
                      <div className="docker-image-combobox" ref={netComboRef}>
                        <div className="docker-image-combobox__input-wrap">
                          <input
                            value={netInputValue || deployForm.network}
                            onChange={(e) => {
                              setNetInputValue(e.target.value)
                              setNetDropdownOpen(true)
                              setImgDropdownOpen(false)
                              setNameDropdownOpen(false)
                            }}
                            onFocus={() => {
                              setNetDropdownOpen(true)
                              setImgDropdownOpen(false)
                              setNameDropdownOpen(false)
                            }}
                            placeholder="Default (bridge) / cari network..."
                            className="panel-input docker-image-combobox__input"
                            autoComplete="off"
                          />
                          {(deployForm.network || netInputValue) && (
                            <button
                              type="button"
                              className="docker-image-combobox__clear"
                              onClick={() => {
                                setDeployForm({ ...deployForm, network: '' })
                                setNetInputValue('')
                                setNetDropdownOpen(false)
                              }}
                              title="Reset ke default"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          <button type="button" className="docker-image-combobox__toggle" onClick={() => { setNetDropdownOpen((v) => !v); setImgDropdownOpen(false); setNameDropdownOpen(false) }}>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {netDropdownOpen && (
                          <div className="docker-image-combobox__dropdown">
                            <button
                              type="button"
                              className={`docker-image-combobox__item ${!deployForm.network ? 'docker-image-combobox__item--selected' : ''}`}
                              onClick={() => {
                                setDeployForm({ ...deployForm, network: '' })
                                setNetInputValue('')
                                setNetDropdownOpen(false)
                              }}
                            >
                              <span className="docker-image-combobox__item-name">Default (bridge)</span>
                              {!deployForm.network && <Check className="h-3.5 w-3.5 ml-auto" />}
                            </button>
                            {(networksData?.items ?? [])
                              .filter((net) => {
                                if (!netInputValue) return true
                                const needle = netInputValue.toLowerCase()
                                return [net.Name, net.Driver, net.Subnet, net.Gateway].filter(Boolean).join(' ').toLowerCase().includes(needle)
                              })
                              .map((net) => (
                                <button
                                  key={net.Id}
                                  type="button"
                                  className={`docker-image-combobox__item ${deployForm.network === net.Name ? 'docker-image-combobox__item--selected' : ''}`}
                                  onClick={() => {
                                    setDeployForm({ ...deployForm, network: net.Name })
                                    setNetInputValue('')
                                    setNetDropdownOpen(false)
                                  }}
                                >
                                  <span className="docker-image-combobox__item-name">{net.Name}</span>
                                  <span className="docker-net-dropdown-meta">
                                    <span className="docker-net-dropdown-meta__driver">{net.Driver}</span>
                                    {net.Subnet && <span className="docker-net-dropdown-meta__subnet">{net.Subnet}</span>}
                                    {net.Gateway && <span className="docker-net-dropdown-meta__gw">gw {net.Gateway}</span>}
                                  </span>
                                  {deployForm.network === net.Name && <Check className="h-3.5 w-3.5 ml-auto flex-shrink-0" />}
                                </button>
                              ))}

                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ports */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="panel-section-label mb-0">Ports (Host : Container)</label>
                        <button onClick={() => setDeployForm({ ...deployForm, ports: [...deployForm.ports, { hostPort: '', containerPort: '' }] })} className="text-[10px] text-blue-500 hover:underline">Add Port</button>
                      </div>
                      {deployForm.ports.map((p, i) => (
                        <div key={i} className="flex gap-2 mb-2 items-center">
                          <input value={p.hostPort} onChange={(e) => { const newP = [...deployForm.ports]; newP[i].hostPort = e.target.value; setDeployForm({ ...deployForm, ports: newP }) }} placeholder="8080" className="panel-input flex-1" />
                          <span className="text-[var(--text-secondary)] py-2">:</span>
                          <input value={p.containerPort} onChange={(e) => { const newP = [...deployForm.ports]; newP[i].containerPort = e.target.value; setDeployForm({ ...deployForm, ports: newP }) }} placeholder="80" className="panel-input flex-1" />
                          <button onClick={() => setDeployForm({ ...deployForm, ports: deployForm.ports.filter((_, idx) => idx !== i) })} className="panel-icon-btn"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Environment Variables */}
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <label className="panel-section-label mb-0">Environment Variables</label>
                        <div className="flex justify-end gap-2">
                          <div className="docker-env-mode-switch" role="tablist" aria-label="Environment input mode">
                            <button
                              type="button"
                              className={`docker-env-mode-switch__btn ${deployForm.envMode === 'form' ? 'docker-env-mode-switch__btn--active' : ''}`}
                              onClick={() => {
                                setDeployForm((current) => ({
                                  ...current,
                                  envMode: 'form',
                                  env: toEnvRows(current.envRaw || toRawEnv(current.env)),
                                }))
                              }}
                            >
                              Form
                            </button>
                            <button
                              type="button"
                              className={`docker-env-mode-switch__btn ${deployForm.envMode === 'raw' ? 'docker-env-mode-switch__btn--active' : ''}`}
                              onClick={() => {
                                setDeployForm((current) => ({
                                  ...current,
                                  envMode: 'raw',
                                  envRaw: current.envRaw || toRawEnv(current.env),
                                }))
                              }}
                            >
                              Raw
                            </button>
                            {/* <button
                              type="button"
                              className={`docker-env-mode-switch__btn text-[10px] text-blue-500 hover:underline`}
                              onClick={() => {
                                setDeployForm((current) => ({
                                  ...current,
                                  envMode: 'raw',
                                  envRaw: current.envRaw || toRawEnv(current.env),
                                }))
                              }}
                            >
                              Add Env
                            </button> */}
                          </div>
                          {deployForm.envMode === 'form' && <button onClick={() => setDeployForm({ ...deployForm, env: [...deployForm.env, { key: '', value: '' }] })} className="text-[10px] text-blue-500 hover:underline">Add Env</button>}
                        </div>
                      </div>

                      {deployForm.envMode === 'form' ? (
                        <>
                          {/* <div className="flex justify-end mb-1">
                            <button onClick={() => setDeployForm({ ...deployForm, env: [...deployForm.env, { key: '', value: '' }] })} className="text-[10px] text-blue-500 hover:underline">Add Env</button>
                          </div> */}
                          {deployForm.env.map((e, i) => (
                            <div key={i} className="flex gap-2 mb-2 items-center">
                              <input value={e.key} onChange={(evt) => { const newE = [...deployForm.env]; newE[i].key = evt.target.value; setDeployForm({ ...deployForm, env: newE, envRaw: toRawEnv(newE) }) }} placeholder="TZ" className="panel-input flex-1" />
                              <span className="text-[var(--text-secondary)] py-2">=</span>
                              <input value={e.value} onChange={(evt) => { const newE = [...deployForm.env]; newE[i].value = evt.target.value; setDeployForm({ ...deployForm, env: newE, envRaw: toRawEnv(newE) }) }} placeholder="Asia/Jakarta" className="panel-input flex-1" />
                              <button onClick={() => { const newEnv = deployForm.env.filter((_, idx) => idx !== i); const nextEnv = newEnv.length > 0 ? newEnv : [EMPTY_ENV_ROW]; setDeployForm({ ...deployForm, env: nextEnv, envRaw: toRawEnv(nextEnv) }) }} className="panel-icon-btn"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ))}
                          <p className="panel-hint">Mode form cocok untuk edit cepat per pasangan <code>KEY=VALUE</code>.</p>
                        </>
                      ) : (
                        <>
                          <textarea
                            value={deployForm.envRaw}
                            onChange={(e) => setDeployForm({ ...deployForm, envRaw: e.target.value })}
                            rows={8}
                            className="panel-textarea panel-input--mono"
                            placeholder={'TZ=Asia/Jakarta\nAPP_ENV=production\n# komentar diperbolehkan'}
                          />
                          <p className="panel-hint">Gunakan satu baris per variabel. Baris kosong dan komentar <code>#</code> akan diabaikan.</p>
                        </>
                      )}
                    </div>

                    {/* Volumes */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="panel-section-label mb-0">Volumes (Host Path : Container Path)</label>
                        <button onClick={() => setDeployForm({ ...deployForm, volumes: [...deployForm.volumes, { hostPath: '', containerPath: '' }] })} className="text-[10px] text-blue-500 hover:underline">Add Volume</button>
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] mb-2">Host path must be a relative directory inside your home root, e.g. "data/app" or "config".</p>
                      {deployForm.volumes.map((v, i) => (
                        <div key={i} className="flex gap-2 mb-2 items-center">
                          <input value={v.hostPath} onChange={(evt) => { const newV = [...deployForm.volumes]; newV[i].hostPath = evt.target.value; setDeployForm({ ...deployForm, volumes: newV }) }} placeholder="data/app" className="panel-input flex-1" />
                          <span className="text-[var(--text-secondary)] py-2">:</span>
                          <input value={v.containerPath} onChange={(evt) => { const newV = [...deployForm.volumes]; newV[i].containerPath = evt.target.value; setDeployForm({ ...deployForm, volumes: newV }) }} placeholder="/app/data" className="panel-input flex-1" />
                          <button onClick={() => setDeployForm({ ...deployForm, volumes: deployForm.volumes.filter((_, idx) => idx !== i) })} className="panel-icon-btn"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="panel-section-label mb-0">docker-compose.yml</label>
                    {/* {(templatesData?.items?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        className="text-[10px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1"
                        onClick={() => setShowTplPicker((v) => !v)}
                      >
                        <Layers3 className="h-3 w-3" /> Pilih Template
                      </button>
                    )} */}
                  </div>
                  {/* {showTplPicker && (
                    <div className="docker-tpl-picker">
                      {(templatesData?.items ?? []).map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          className="docker-tpl-picker__item"
                          onClick={() => {
                            setDeployForm((f) => ({ ...f, composeYaml: tmpl.yamlContent, name: f.name || tmpl.name }))
                            setShowTplPicker(false)
                          }}
                        >
                          <span className="docker-tpl-picker__name">{tmpl.name}</span>
                          {tmpl.description && <span className="docker-tpl-picker__desc">{tmpl.description}</span>}
                        </button>
                      ))}
                    </div>
                  )} */}
                  <textarea
                    value={deployForm.composeYaml}
                    onChange={(e) => setDeployForm({ ...deployForm, composeYaml: e.target.value })}
                    rows={12}
                    className="panel-textarea panel-input--mono"
                    placeholder={"version: '3'\nservices:\n..."}
                  />
                </div>
              )}

            </div>

            <div className="mt-5 pt-2 border-t border-[var(--win-border)]" onClick={() => { setImgDropdownOpen(false); setNameDropdownOpen(false); setNetDropdownOpen(false) }}>

              {/* Simpan sebagai template checkbox (compose only) */}
              {deployType === 'compose' && (
                <>
                  <div className="docker-auth-block mt-3">
                    {/* Registry Auth for Compose */}
                    <label className="docker-save-tpl-check">
                      <input
                        type="checkbox"
                        checked={deployForm.registryAuth.enabled}
                        onChange={(e) => setDeployForm((current) => ({
                          ...current,
                          registryAuth: { ...current.registryAuth, enabled: e.target.checked },
                        }))}
                      />
                      <span>Gunakan autentikasi registry</span>
                    </label>
                    {deployForm.registryAuth.enabled && (
                      <div className="docker-auth-grid mt-2">
                        <div className="panel-field">
                          <label className="panel-label">Registry <span className="docker-field-optional">opsional</span></label>
                          <input
                            className="panel-input"
                            placeholder="docker.io atau ghcr.io"
                            value={deployForm.registryAuth.registry}
                            onChange={(e) => setDeployForm((current) => ({
                              ...current,
                              registryAuth: { ...current.registryAuth, registry: e.target.value },
                            }))}
                          />
                        </div>
                        <div className="panel-field">
                          <label className="panel-label">Username / Email *</label>
                          <input
                            className="panel-input"
                            placeholder="username atau email registry"
                            value={deployForm.registryAuth.usernameOrEmail}
                            onChange={(e) => setDeployForm((current) => ({
                              ...current,
                              registryAuth: { ...current.registryAuth, usernameOrEmail: e.target.value },
                            }))}
                          />
                        </div>
                        <div className="panel-field docker-auth-grid__full">
                          <label className="panel-label">Password *</label>
                          <input
                            type="password"
                            className="panel-input"
                            placeholder="••••••••"
                            value={deployForm.registryAuth.password}
                            onChange={(e) => setDeployForm((current) => ({
                              ...current,
                              registryAuth: { ...current.registryAuth, password: e.target.value },
                            }))}
                          />
                        </div>
                      </div>
                    )}
                    <label className="docker-save-tpl-check">
                      <input
                        type="checkbox"
                        checked={showSaveAsTpl}
                        onChange={(e) => setShowSaveAsTpl(e.target.checked)}
                      />
                      <span>Simpan sebagai template</span>
                      {showSaveAsTpl && deployForm.name && (
                        <span className="docker-save-tpl-check__name">"{deployForm.name}"</span>
                      )}
                    </label>
                  </div>
                </>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={() => { resetDeployModal() }} className="panel-btn panel-btn--ghost flex-1">Batal</button>
                <button
                  onClick={async () => {
                    if (deployType === 'image') {
                      if (!deployForm.network) {
                        const confirmed = await alertLib.confirm(
                          'Network Masih Kosong',
                          'Anda belum memilih network. Container akan dijalankan menggunakan <strong>Default (bridge)</strong>. Lanjutkan deploy?',
                          'Ya, pakai Default',
                          'Pilih Network Dulu',
                          'warning',
                          'apps',
                        )
                        if (!confirmed) return
                      }

                      const normalizedEnv = deployForm.envMode === 'raw'
                        ? toEnvRows(deployForm.envRaw)
                        : deployForm.env.filter(e => e.key.trim())

                      const payload = {
                        ownerUserId: deployForm.ownerUserId,
                        name: deployForm.name,
                        image: deployForm.image,
                        network: deployForm.network || undefined,
                        ports: deployForm.ports.filter(p => p.containerPort),
                        env: normalizedEnv.filter(e => e.key.trim()),
                        envMode: deployForm.envMode,
                        envRaw: deployForm.envMode === 'raw' ? deployForm.envRaw : undefined,
                        registryAuth: deployForm.registryAuth.enabled
                          ? {
                            enabled: true,
                            registry: deployForm.registryAuth.registry || undefined,
                            usernameOrEmail: deployForm.registryAuth.usernameOrEmail,
                            password: deployForm.registryAuth.password,
                          }
                          : undefined,
                        volumes: deployForm.volumes.filter(v => v.containerPath),
                        replaceContainerId: editContainer ? editContainer.id : undefined,
                      }
                      deployImageMut.mutate(payload, {
                        onSuccess: () => {
                          toast.success(editContainer ? 'Container berhasil di-redeploy' : 'Container deployed successfully')
                          resetDeployModal()
                        },
                        onError: (e: any) => alertLib.fire('Deploy Failed', e.response?.data?.error || 'Unknown error', 'error', 'apps')
                      })
                    } else {
                      // optionally save as template first
                      if (showSaveAsTpl && deployForm.name.trim()) {
                        try {
                          await createTemplateMut.mutateAsync({ name: deployForm.name.trim(), description: '', yamlContent: deployForm.composeYaml })
                          toast.success(`Template "${deployForm.name}" tersimpan`)
                        } catch { /* ignore template save error */ }
                      }
                      deployComposeMut.mutate({
                        ownerUserId: deployForm.ownerUserId,
                        name: deployForm.name,
                        composeYaml: deployForm.composeYaml,
                        registryAuth: deployForm.registryAuth.enabled
                          ? {
                            enabled: true,
                            registry: deployForm.registryAuth.registry || undefined,
                            usernameOrEmail: deployForm.registryAuth.usernameOrEmail,
                          }
                          : undefined,
                        replaceContainerId: editContainer ? editContainer.id : undefined,
                      }, {
                        onSuccess: () => {
                          toast.success('Compose project deployed successfully')
                          resetDeployModal()
                        },
                        onError: (e: any) => alertLib.fire('Deploy Failed', e.response?.data?.error || 'Unknown error', 'error', 'apps')
                      })
                    }
                  }}
                  disabled={deployImageMut.isPending || deployComposeMut.isPending || createTemplateMut.isPending || !deployForm.name}
                  className="panel-btn panel-btn--primary flex-1"
                >
                  {deployImageMut.isPending || deployComposeMut.isPending ? (editContainer ? 'Re-deploying...' : 'Deploying...') : (editContainer ? 'Simpan & Re-deploy' : 'Deploy')}
                </button>
              </div>
            </div>

          </div>

          {/* ── Deploy Loading Overlay ── */}
          {(deployImageMut.isPending || deployComposeMut.isPending) && (
            <div className="docker-deploy-loading-overlay">
              <div className="docker-deploy-loading__inner">
                <div className="docker-deploy-loading__spinner">
                  <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="3" strokeOpacity="0.15" />
                    <path d="M28 4a24 24 0 0 1 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="docker-deploy-loading__arc" />
                  </svg>
                </div>
                <div className="docker-deploy-loading__title">
                  {editContainer ? 'Re-deploying Container...' : 'Deploying Container...'}
                </div>
                <div className="docker-deploy-loading__subtitle">
                  {deployForm.name && <code>{deployForm.name}</code>}
                </div>
                <div className="docker-deploy-loading__steps">
                  <DeployStep label={deployType === 'image' ? 'Pull / verify image' : 'Parse compose YAML'} delay={0} />
                  <DeployStep label="Create container & mount volumes" delay={1200} />
                  <DeployStep label="Attach network & bind ports" delay={2800} />
                  <DeployStep label="Start service" delay={4500} />
                </div>
                <p className="docker-deploy-loading__note">Proses bisa memakan waktu jika image perlu diunduh.</p>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Delete Container Modal ── */}
      {deleteConfirm && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card" style={{ width: 'min(100%, 440px)' }}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <Trash2 className="h-4 w-4 text-[var(--panel-danger-text)]" />
              Hapus Container
            </h3>
            <p className="mb-4 text-xs text-[var(--text-secondary)] leading-relaxed">
              Container <strong className="text-[var(--win-text)]">{deleteConfirm.name}</strong> akan dihapus secara permanen.
              Pilih opsi tambahan di bawah ini.
            </p>

            <div className="space-y-3 mb-5">
              <label className="docker-save-tpl-check">
                <input
                  type="checkbox"
                  checked={deleteOpts.removeVolumes}
                  onChange={(e) => setDeleteOpts((v) => ({ ...v, removeVolumes: e.target.checked }))}
                />
                <span>Hapus volume & data container</span>
                <span className="docker-save-tpl-check__name text-[var(--panel-danger-text)]">(-v)</span>
              </label>
              <label className="docker-save-tpl-check">
                <input
                  type="checkbox"
                  checked={deleteOpts.removeImage}
                  onChange={(e) => setDeleteOpts((v) => ({ ...v, removeImage: e.target.checked }))}
                />
                <span>Hapus image</span>
                <span className="docker-save-tpl-check__name font-mono text-[11px]">{deleteConfirm.image}</span>
              </label>
              {deleteOpts.removeImage && (
                <p className="text-[11px] text-[var(--panel-warning-text)] pl-5 leading-relaxed">
                  ⚠ Image hanya akan dihapus jika tidak digunakan oleh container lain.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="panel-btn panel-btn--ghost flex-1"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate({ id: deleteConfirm.id, opts: deleteOpts })
                  setDeleteConfirm(null)
                }}
                disabled={deleteMutation.isPending}
                className="panel-btn panel-btn--danger flex-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        {activeTab === 'containers' && (
          <div className="panel-window__stack">
            <div className="docker-summary-grid">
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Layers3 className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">Total container</div>
                  <div className="docker-summary-card__value">{containers.length}</div>
                </div>
              </div>
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Activity className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">Sedang berjalan</div>
                  <div className="docker-summary-card__value">{stats.running}</div>
                </div>
              </div>
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Server className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">Memiliki IP aktif</div>
                  <div className="docker-summary-card__value">{stats.withIPs}</div>
                </div>
              </div>
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Box className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">Port ter-publish</div>
                  <div className="docker-summary-card__value">{stats.withPublishedPorts}</div>
                </div>
              </div>
            </div>

            <div className="panel-table-container">
              <div className="panel-toolbar panel-toolbar--search docker-toolbar-card">
                <form
                  className="panel-search"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setSearch(query.trim())
                  }}
                >
                  <Search className="h-4 w-4" />
                  <input
                    id="docker-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="panel-search__input"
                    placeholder="Cari nama container, image, state, network, atau container id..."
                  />
                  <button type="submit" className="panel-btn panel-btn--primary-soft">Cari</button>
                </form>
              </div>

              {isLoading ? (
                <div className="panel-loading">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Menghubungkan ke runtime agent...
                </div>
              ) : isError ? (
                <div className="panel-error-state">
                  <ContainerIcon className="h-5 w-5" />
                  <div>
                    <p className="font-semibold">Tidak bisa memuat container dari agent</p>
                    <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
                    <p className="mt-1 text-[12px] leading-6 opacity-80">Pastikan ui-panel-agent aktif dan Docker dapat diakses oleh backend.</p>
                  </div>
                </div>
              ) : filteredContainers.length === 0 ? (
                <div className="panel-empty panel-empty--wide">
                  <Boxes className="h-8 w-8" />
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-[var(--win-text)]">Tidak ada container yang cocok</div>
                    <div>Ubah kata kunci pencarian atau kosongkan filter untuk melihat semua runtime apps.</div>
                  </div>
                </div>
              ) : (
                <>
                  {filteredContainers.map((container) => {
                    console.log("container", container);
                    const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
                    const stateStyle = STATE_STYLES[container.State] ?? STATE_STYLES.dead
                    const ActionIcon = stateStyle.actionIcon
                    const {
                      // primaryInternal,
                      primaryPublished, internal, published } = getContainerPorts(container)
                    const networks = container.Networks?.length ? container.Networks.join(', ') : 'bridge/default'
                    const ipAddresses = container.IpAddresses?.length ? container.IpAddresses.join(', ') : 'Tidak tersedia'

                    return (
                      <div key={container.Id} className="panel-table-row">
                        <div className="docker-container-row__main">
                          <div className="docker-container-row__header">
                            {/* <div className="panel-avatar docker-container-row__actions">{getIcon(name)}</div> */}
                            <div className="docker-container-card__title-wrap">
                              <div className="docker-container-card__title-row">
                                <span className="docker-container-card__title">{name}</span>
                                <StatusBadge state={container.State} />
                                {/* <span className="panel-badge panel-badge--neutral">{formatRelativeCreated(container.Created)}</span> */}
                              </div>
                              <div className="docker-container-card__subtitle">{container.Image}</div>
                              <div className="docker-container-card__meta-row">
                                <span className="docker-inline-code">ID {container.Id.slice(0, 12)}</span>
                                <span className="docker-inline-code">Network {networks}</span>
                                <span className="docker-inline-code">IP {ipAddresses}</span>
                                {/* <span className="docker-inline-code">Internal {primaryInternal}</span> */}
                                <span className="docker-inline-code">Port {primaryPublished}</span>
                                <span className="docker-inline-dot" />
                                <span>{container.Status}</span>
                              </div>
                            </div>
                            <div className="docker-container-row__actions">
                              <button
                                type="button"
                                className="panel-icon-btn"
                                title="Edit & Re-deploy Container"
                                disabled={editLoading}
                                onClick={async () => {
                                  setEditLoading(true)
                                  try {
                                    const cfg = await fetchContainerConfig(container.Id)
                                    const envRows = cfg.env.length > 0 ? cfg.env : [EMPTY_ENV_ROW]
                                    const envRaw = cfg.envRaw || toRawEnv(envRows)
                                    setDeployType('image')
                                    setImgInputValue(cfg.image)
                                    setNetInputValue('')
                                    setDeployForm({
                                      ownerUserId: 0,
                                      name: cfg.name,
                                      image: cfg.image,
                                      network: cfg.network || '',
                                      ports: cfg.ports.length > 0
                                        ? cfg.ports.map((p) => ({ hostPort: p.hostPort, containerPort: p.containerPort }))
                                        : [{ hostPort: '', containerPort: '' }],
                                      env: envRows,
                                      envMode: cfg.envMode || 'form',
                                      envRaw,
                                      registryAuth: createEmptyRegistryAuth(),
                                      volumes: cfg.volumes.length > 0
                                        ? cfg.volumes.map((v) => ({ hostPath: v.hostPath, containerPath: v.containerPath }))
                                        : [{ hostPath: '', containerPath: '' }],
                                      composeYaml: DEFAULT_COMPOSE_YAML,
                                    })
                                    setEditContainer({ id: container.Id })
                                    setShowDeploy(true)
                                  } catch (e: any) {
                                    toast.error('Gagal mengambil konfigurasi container')
                                  } finally {
                                    setEditLoading(false)
                                  }
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="panel-icon-btn panel-icon-btn--warning"
                                onClick={() => restartMutation.mutate(container.Id)}
                                disabled={restartMutation.isPending}
                                title="Restart Container"
                              >
                                <RefreshCcw className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className={`panel-btn ${stateStyle.btn} min-w-[98px]`}
                                onClick={() => container.State === 'running' ? stopMutation.mutate(container.Id) : startMutation.mutate(container.Id)}
                                disabled={startMutation.isPending || stopMutation.isPending}
                              >
                                <ActionIcon className="h-3.5 w-3.5" />
                                {stateStyle.btnText}
                              </button>
                              <button
                                type="button"
                                className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                                onClick={() => {
                                  setDeleteOpts({ removeVolumes: false, removeImage: false })
                                  setDeleteConfirm({ id: container.Id, name, image: container.Image })
                                }}
                                disabled={deleteMutation.isPending}
                                title="Delete Container"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {(internal.length > 1 || published.length > 1) && (
                            <div className="docker-token-groups docker-token-groups--inline">
                              {internal.length > 1 && (
                                <div className="docker-token-group">
                                  <div className="docker-port-section__label">Port internal lain</div>
                                  <div className="docker-token-row">
                                    {internal.slice(1).map((value) => (
                                      <MetaChip key={value} value={value} />
                                    ))}
                                  </div>
                                </div>
                              )}
                              {published.length > 1 && (
                                <div className="docker-token-group">
                                  <div className="docker-port-section__label">Forward lain</div>
                                  <div className="docker-token-row">
                                    {published.slice(1).map((value) => (
                                      <MetaChip key={value} value={value} tone="primary" />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'images' && (() => {
          const allImgs = imagesData?.items ?? []
          const filteredImgs = allImgs.filter((img) => {
            const q = imgSearch.toLowerCase()
            return !q || img.Repository.toLowerCase().includes(q) || img.Tag.toLowerCase().includes(q) || img.Id.toLowerCase().includes(q)
          })
          const totalPages = Math.max(1, Math.ceil(filteredImgs.length / IMG_PAGE_SIZE))
          const pagedImgs = filteredImgs.slice((imgPage - 1) * IMG_PAGE_SIZE, imgPage * IMG_PAGE_SIZE)
          return (
            <div className="panel-window__stack">
              <div className="panel-table-container">
                <div className="docker-tab-toolbar">
                  <div className="docker-tab-toolbar__left">
                    <span className="docker-tab-toolbar__title">Local Images</span>
                    <span className="panel-badge panel-badge--neutral">{allImgs.length}</span>
                  </div>
                  <div className="docker-tab-toolbar__right">
                    <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => { e.preventDefault(); setImgPage(1) }}>
                      <Search className="h-3.5 w-3.5" />
                      <input className="panel-search__input" placeholder="Cari image..." value={imgSearch} onChange={(e) => { setImgSearch(e.target.value); setImgPage(1) }} />
                    </form>
                    <button
                      type="button"
                      className="panel-btn panel-btn--primary-soft"
                      onClick={() => setShowPullImage(true)}
                      disabled={pullImageMut.isPending}
                    >
                      <Plus className="h-3.5 w-3.5" /> Pull Image
                    </button>
                  </div>
                </div>
                {showPullImage && (
                  <div className="docker-modal-overlay" onClick={() => resetPullImageModal()}>
                    <div className="docker-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="docker-modal__header">
                        <span className="docker-modal__title">Pull Docker Image</span>
                        <button type="button" className="panel-icon-btn" onClick={() => resetPullImageModal()}><X className="h-4 w-4" /></button>
                      </div>
                      <div className="docker-modal__body">
                        <div className="panel-field">
                          <label className="panel-label">Image *</label>
                          <input
                            className="panel-input"
                            placeholder="ghcr.io/owner/app:latest"
                            value={pullImageForm.image}
                            onChange={(e) => setPullImageForm((current) => ({ ...current, image: e.target.value }))}
                          />
                        </div>
                        <div className="docker-auth-block">
                          <label className="docker-save-tpl-check">
                            <input
                              type="checkbox"
                              checked={pullImageForm.registryAuth.enabled}
                              onChange={(e) => setPullImageForm((current) => ({
                                ...current,
                                registryAuth: {
                                  ...current.registryAuth,
                                  enabled: e.target.checked,
                                },
                              }))}
                            />
                            <span>Gunakan autentikasi registry</span>
                          </label>
                          {pullImageForm.registryAuth.enabled && (
                            <div className="docker-auth-grid">
                              <div className="panel-field">
                                <label className="panel-label">Registry <span className="docker-field-optional">opsional</span></label>
                                <input
                                  className="panel-input"
                                  placeholder="docker.io atau ghcr.io"
                                  value={pullImageForm.registryAuth.registry}
                                  onChange={(e) => setPullImageForm((current) => ({
                                    ...current,
                                    registryAuth: { ...current.registryAuth, registry: e.target.value },
                                  }))}
                                />
                              </div>
                              <div className="panel-field">
                                <label className="panel-label">Username / Email *</label>
                                <input
                                  className="panel-input"
                                  placeholder="username atau email registry"
                                  value={pullImageForm.registryAuth.usernameOrEmail}
                                  onChange={(e) => setPullImageForm((current) => ({
                                    ...current,
                                    registryAuth: { ...current.registryAuth, usernameOrEmail: e.target.value },
                                  }))}
                                />
                              </div>
                              <div className="panel-field docker-auth-grid__full">
                                <label className="panel-label">Password *</label>
                                <input
                                  type="password"
                                  className="panel-input"
                                  placeholder="••••••••"
                                  value={pullImageForm.registryAuth.password}
                                  onChange={(e) => setPullImageForm((current) => ({
                                    ...current,
                                    registryAuth: { ...current.registryAuth, password: e.target.value },
                                  }))}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="docker-modal__footer">
                        <button type="button" className="panel-btn panel-btn--ghost" onClick={() => resetPullImageModal()}>Batal</button>
                        <button
                          type="button"
                          className="panel-btn panel-btn--primary"
                          disabled={pullImageMut.isPending || !pullImageForm.image.trim()}
                          onClick={() => {
                            pullImageMut.mutate({
                              image: pullImageForm.image.trim(),
                              registryAuth: pullImageForm.registryAuth.enabled
                                ? {
                                  enabled: true,
                                  registry: pullImageForm.registryAuth.registry || undefined,
                                  usernameOrEmail: pullImageForm.registryAuth.usernameOrEmail,
                                  password: pullImageForm.registryAuth.password,
                                }
                                : undefined,
                            }, {
                              onSuccess: () => {
                                toast.success(`Image ${pullImageForm.image.trim()} berhasil di-pull`)
                                resetPullImageModal()
                                void refetchImages()
                              },
                              onError: (e: any) => alertLib.fire('Pull Image Failed', e.response?.data?.error || 'Unknown error', 'error', 'apps')
                            })
                          }}
                        >
                          {pullImageMut.isPending ? 'Pulling...' : 'Pull Image'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {pagedImgs.length === 0 ? (
                  <div className="panel-empty panel-empty--wide">
                    <Box className="h-8 w-8" />
                    <div className="text-sm font-medium text-[var(--win-text)]">{imgSearch ? 'Tidak ada hasil' : 'Belum ada image lokal'}</div>
                  </div>
                ) : (
                  <>
                    {pagedImgs.map((img) => (
                      // <div key={img.Id} className="panel-table-row">
                      //   <div className="docker-flat-row__info">
                      //     <span className="docker-flat-row__name">{img.Repository}</span>
                      //     <span className="panel-badge panel-badge--neutral">{img.Tag}</span>
                      //     {/* <span className="docker-inline-code">ID {img.Id.slice(0, 12)}</span>
                      //     <MetaChip label="Size" value={img.Size} />
                      //     <MetaChip label="Created" value={img.CreatedAt} tone="info" /> */}
                      //   </div>
                      //   <div className="docker-flat-row__desc">
                      //     <span className="panel-badge panel-badge--detail">
                      //       ID : {img.Id.slice(0, 12)}
                      //       Size : {img.Size}
                      //       Created : {img.CreatedAt}
                      //     </span>
                      //   </div>
                      //   <button type="button" className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                      //     onClick={async () => { const ok = await alertLib.confirm('Delete Image', `Delete ${img.Repository}:${img.Tag}?`, 'Delete', 'Cancel', 'warning', 'apps'); if (ok) deleteImageMut.mutate(img.Id) }}
                      //     disabled={deleteImageMut.isPending} title="Delete Image">
                      //     <Trash2 className="h-3.5 w-3.5" />
                      //   </button>
                      // </div>
                      <div key={img.Id} className="panel-table-row">
                        <div className="row-top">
                          <div className="docker-flat-row__info">
                            <span className="docker-flat-row__name">{img.Repository}</span>
                            <span className="panel-badge panel-badge--neutral">{img.Tag}</span>
                          </div>

                          <button type="button" className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                            onClick={async () => { const ok = await alertLib.confirm('Delete Image', `Delete ${img.Repository}:${img.Tag}?`, 'Delete', 'Cancel', 'warning', 'apps'); if (ok) deleteImageMut.mutate(img.Id) }}
                            disabled={deleteImageMut.isPending} title="Delete Image">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="docker-flat-row__desc">
                          <span className="panel-badge panel-badge--detail">
                            ID : {img.Id.slice(0, 12)}<br />
                            Size : {img.Size}<br />
                            Created : {img.CreatedAt}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {totalPages > 1 && (
                  <div className="panel-pagination">
                    <button className="panel-btn panel-btn--ghost" disabled={imgPage <= 1} onClick={() => setImgPage((v) => Math.max(1, v - 1))}><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Page {imgPage} of {totalPages}</span>
                    <button className="panel-btn panel-btn--ghost" disabled={imgPage >= totalPages} onClick={() => setImgPage((v) => Math.min(totalPages, v + 1))}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {activeTab === 'networks' && (() => {
          const allNets = networksData?.items ?? []
          const filteredNets = allNets.filter((net) => {
            const q = netSearch.toLowerCase()
            return !q || net.Name.toLowerCase().includes(q) || net.Driver.toLowerCase().includes(q) || net.Id.toLowerCase().includes(q)
          })
          return (
            <div className="panel-window__stack">
              {showCreateNet && (
                <div className="docker-modal-overlay" onClick={() => setShowCreateNet(false)}>
                  <div className="docker-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="docker-modal__header">
                      <span className="docker-modal__title">Buat Network Baru</span>
                      <button type="button" className="panel-icon-btn" onClick={() => setShowCreateNet(false)}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="docker-modal__body">
                      <div className="panel-field">
                        <label className="panel-label">Nama Network *</label>
                        <input className="panel-input" placeholder="my-network" value={netForm.name} onChange={(e) => setNetForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">Subnet (CIDR) <span className="docker-field-optional">opsional</span></label>
                        <input className="panel-input" placeholder="172.20.0.0/16" value={netForm.subnet} onChange={(e) => setNetForm((f) => ({ ...f, subnet: e.target.value }))} />
                        <p className="panel-hint">Rentang IP untuk network ini, contoh: <code>172.20.0.0/16</code></p>
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">Gateway <span className="docker-field-optional">opsional</span></label>
                        <input className="panel-input" placeholder="172.20.0.1" value={netForm.gateway} onChange={(e) => setNetForm((f) => ({ ...f, gateway: e.target.value }))} />
                        <p className="panel-hint">IP gateway untuk subnet di atas, contoh: <code>172.20.0.1</code></p>
                      </div>
                    </div>
                    <div className="docker-modal__footer">
                      <button type="button" className="panel-btn panel-btn--ghost" onClick={() => setShowCreateNet(false)}>Batal</button>
                      <button type="button" className="panel-btn panel-btn--primary"
                        disabled={createNetworkMut.isPending || !netForm.name.trim()}
                        onClick={async () => {
                          await createNetworkMut.mutateAsync({ name: netForm.name.trim(), subnet: netForm.subnet.trim() || undefined, gateway: netForm.gateway.trim() || undefined })
                          toast.success(`Network "${netForm.name}" berhasil dibuat`)
                          setShowCreateNet(false)
                          setNetForm({ name: '', subnet: '', gateway: '' })
                        }}>
                        {createNetworkMut.isPending ? 'Membuat...' : 'Buat Network'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="panel-table-container">
                <div className="docker-tab-toolbar">
                  <div className="docker-tab-toolbar__left">
                    <span className="docker-tab-toolbar__title">Docker Networks</span>
                    <span className="panel-badge panel-badge--neutral">{allNets.length}</span>
                  </div>
                  <div className="docker-tab-toolbar__right">
                    <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => e.preventDefault()}>
                      <Search className="h-3.5 w-3.5" />
                      <input className="panel-search__input" placeholder="Cari network..." value={netSearch} onChange={(e) => setNetSearch(e.target.value)} />
                    </form>
                    <button type="button" className="panel-btn panel-btn--primary-soft"
                      onClick={() => setShowCreateNet(true)}
                      disabled={createNetworkMut.isPending}>
                      <Plus className="h-3.5 w-3.5" /> Buat Network
                    </button>
                  </div>
                </div>
                {filteredNets.length === 0 ? (
                  <div className="panel-empty panel-empty--wide">
                    <Activity className="h-8 w-8" />
                    <div className="text-sm font-medium text-[var(--win-text)]">{netSearch ? 'Tidak ada hasil' : 'Belum ada network'}</div>
                  </div>
                ) : (
                  <>
                    {filteredNets.map((net) => (
                      // <div key={net.Id} className="panel-table-row">

                      //   <div className="docker-row-left">
                      //     <div className="docker-flat-row__info">
                      //       <span className="docker-flat-row__name">{net.Name}</span>

                      //       <MetaChip label="Driver" value={net.Driver} tone="info" />
                      //       <MetaChip label="Scope" value={net.Scope} />
                      //       {net.Subnet && <MetaChip label="Subnet" value={net.Subnet} tone="info" />}
                      //       {net.Gateway && <MetaChip label="Gateway" value={net.Gateway} />}
                      //     </div>

                      //     <div className="docker-flat-row__desc">
                      //       <span className="docker-inline-code">
                      //         ID {net.Id.slice(0, 12)}
                      //       </span>
                      //     </div>
                      //   </div>

                      //   <button
                      //     type="button"
                      //     className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                      //     onClick={async () => {
                      //       const ok = await alertLib.confirm(
                      //         'Delete Network',
                      //         `Delete network ${net.Name}?`,
                      //         'Delete',
                      //         'Cancel',
                      //         'warning',
                      //         'apps'
                      //       );
                      //       if (ok) deleteNetworkMut.mutate(net.Id);
                      //     }}
                      //     disabled={deleteNetworkMut.isPending}
                      //     title="Delete Network"
                      //   >
                      //     <Trash2 className="h-3.5 w-3.5" />
                      //   </button>

                      // </div>
                      <div key={net.Id} className="panel-table-row">
                        <div className="row-top">
                          <div className="docker-flat-row__info">
                            <span className="docker-flat-row__name">{net.Name}</span>
                            <span className="panel-badge panel-badge--neutral">{net.Driver}</span>
                          </div>
                          <button
                            type="button"
                            className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                            onClick={async () => {
                              const ok = await alertLib.confirm(
                                'Delete Network',
                                `Delete network ${net.Name}?`,
                                'Delete',
                                'Cancel',
                                'warning',
                                'apps'
                              );
                              if (ok) deleteNetworkMut.mutate(net.Id);
                            }}
                            disabled={deleteNetworkMut.isPending}
                            title="Delete Network"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="docker-flat-row__desc">
                          <span className="panel-badge panel-badge--detail">
                            Scope : {net.Scope}<br />
                            Subnet : {net.Subnet}<br />
                            Gateway : {net.Gateway}<br />
                            ID : {net.Id.slice(0, 12)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {activeTab === 'templates' && (() => {
          const allTpls = templatesData?.items ?? []
          const filteredTpls = allTpls.filter((t) => {
            const q = tplSearch.toLowerCase()
            return !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
          })
          return (
            <div className="panel-window__stack">
              {showCreateTpl && (
                <div className="docker-modal-overlay" onClick={() => setShowCreateTpl(false)}>
                  <div className="docker-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="docker-modal__header">
                      <span className="docker-modal__title">Buat Template Baru</span>
                      <button type="button" className="panel-icon-btn" onClick={() => setShowCreateTpl(false)}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="docker-modal__body">
                      <div className="panel-field">
                        <label className="panel-label">Nama Template</label>
                        <input className="panel-input" placeholder="nginx-basic" value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">Deskripsi</label>
                        <input className="panel-input" placeholder="Deskripsi singkat..." value={tplForm.description} onChange={(e) => setTplForm((f) => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">Docker Compose YAML</label>
                        <textarea className="panel-input docker-modal__yaml" rows={10} value={tplForm.yamlContent} onChange={(e) => setTplForm((f) => ({ ...f, yamlContent: e.target.value }))} />
                      </div>
                    </div>
                    <div className="docker-modal__footer">
                      <button type="button" className="panel-btn panel-btn--ghost" onClick={() => setShowCreateTpl(false)}>Batal</button>
                      <button type="button" className="panel-btn panel-btn--primary"
                        disabled={createTemplateMut.isPending || !tplForm.name.trim()}
                        onClick={async () => {
                          await createTemplateMut.mutateAsync(tplForm)
                          toast.success('Template berhasil dibuat')
                          setShowCreateTpl(false)
                          setTplForm({ name: '', description: '', yamlContent: 'version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n' })
                        }}>
                        {createTemplateMut.isPending ? 'Menyimpan...' : 'Simpan Template'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="panel-table-container">
                <div className="docker-tab-toolbar">
                  <div className="docker-tab-toolbar__left">
                    <span className="docker-tab-toolbar__title">Compose Templates</span>
                    <span className="panel-badge panel-badge--neutral">{allTpls.length}</span>
                  </div>
                  <div className="docker-tab-toolbar__right">
                    <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => e.preventDefault()}>
                      <Search className="h-3.5 w-3.5" />
                      <input className="panel-search__input" placeholder="Cari template..." value={tplSearch} onChange={(e) => setTplSearch(e.target.value)} />
                    </form>
                    <button type="button" className="panel-btn panel-btn--primary" onClick={() => setShowCreateTpl(true)}>
                      <Plus className="h-3.5 w-3.5" /> Buat Template
                    </button>
                  </div>
                </div>
                {filteredTpls.length === 0 ? (
                  <div className="panel-empty panel-empty--wide">
                    <Code className="h-8 w-8" />
                    <div className="text-sm font-medium text-[var(--win-text)]">{tplSearch ? 'Tidak ada hasil' : 'Belum ada template'}</div>
                  </div>
                ) : (
                  <>
                    {filteredTpls.map((tmpl) => (
                      // <div key={tmpl.id} className="panel-table-row docker-flat-row--template">
                      //   <div className="docker-flat-row__info">
                      //     <span className="docker-flat-row__name">{tmpl.name}</span>
                      //     {tmpl.description && <span className="docker-flat-row__desc">{tmpl.description}</span>}
                      //     <MetaChip label="Dibuat" value={tmpl.createdAt} tone="info" />
                      //   </div>
                      //   <div className="docker-flat-row__actions">
                      //     <button type="button" className="panel-btn panel-btn--primary-soft"
                      //       onClick={() => { setDeployType('compose'); setDeployForm((f) => ({ ...f, name: tmpl.name, composeYaml: tmpl.yamlContent })); setShowDeploy(true) }}>
                      //       <Play className="h-3.5 w-3.5" /> Gunakan
                      //     </button>
                      //     <button type="button" className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                      //       onClick={async () => { const ok = await alertLib.confirm('Delete Template', `Delete ${tmpl.name}?`, 'Delete', 'Cancel', 'warning', 'apps'); if (ok) deleteTemplateMut.mutate(tmpl.id) }}
                      //       disabled={deleteTemplateMut.isPending} title="Delete Template">
                      //       <Trash2 className="h-3.5 w-3.5" />
                      //     </button>
                      //   </div>
                      // </div>
                      <div key={tmpl.id} className="panel-table-row">
                        <div className="row-top">
                          <div className="docker-flat-row__info">
                            <span className="docker-flat-row__name">{tmpl.name}</span>
                            {tmpl.description && (
                              <span className="panel-badge panel-badge--neutral">{tmpl.description}</span>
                            )}
                          </div>
                          <div className="docker-flat-row__actions">
                            <button
                              type="button"
                              className="panel-btn panel-btn--primary-soft"
                              onClick={() => {
                                setDeployType('compose');
                                setDeployForm((f) => ({ ...f, name: tmpl.name, composeYaml: tmpl.yamlContent }));
                                setShowDeploy(true);
                              }}
                            >
                              <Play className="h-3.5 w-3.5" /> Gunakan
                            </button>
                            <button
                              type="button"
                              className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                              onClick={async () => {
                                const ok = await alertLib.confirm(
                                  'Delete Template',
                                  `Delete ${tmpl.name}?`,
                                  'Delete',
                                  'Cancel',
                                  'warning',
                                  'apps'
                                );
                                if (ok) deleteTemplateMut.mutate(tmpl.id);
                              }}
                              disabled={deleteTemplateMut.isPending}
                              title="Delete Template"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="docker-flat-row__desc">
                          <span className="panel-badge panel-badge--detail">
                            Dibuat : {tmpl.createdAt}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}
