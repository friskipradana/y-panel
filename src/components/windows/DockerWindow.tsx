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
import { fetchContainerConfig, fetchContainerLogs } from '@/api/agent'
import { useQuery } from '@tanstack/react-query'

import { useEffect, useMemo, useRef, useState } from 'react'
import { alertLib } from '@/lib/alert'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import type { WindowState } from '@/types'
import { toast } from 'sonner'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'

import {
  Boxes,
  Container as ContainerIcon,
  Play,
  RefreshCw,
  Search,
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
  ScrollText,
  Activity,
} from 'lucide-react'
import { PanelSelectMenu } from '@/components/system/PanelSelectMenu'

import {
  STATE_STYLES,
  EMPTY_ENV_ROW,
  DEFAULT_COMPOSE_YAML,
  createDefaultDeployForm,
  createDefaultPullImageForm,
  createEmptyRegistryAuth,
  toRawEnv,
  toEnvRows,
  getContainerRuntimeIssues,
  getContainerPorts,
} from './docker/constants'
import { StatusBadge, MetaChip, DeployStep } from './docker/DockerComponents'

export function DockerWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const pollingActive = useWindowPollingActive(win)
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<'containers' | 'images' | 'networks' | 'templates'>('containers')
  const { data, isLoading, isError, error, refetch, isFetching } = useContainers(pollingActive)
  const { data: networksData, refetch: refetchNetworks } = useDockerNetworks(pollingActive)
  const { data: imagesData, refetch: refetchImages } = useDockerImages(pollingActive)
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
  const [tplForm, setTplForm] = useState({
    name: '',
    description: '',
    yamlContent: DEFAULT_COMPOSE_YAML,
  })

  const [showDeploy, setShowDeploy] = useState(false)
  const [showPullImage, setShowPullImage] = useState(false)
  const [showSaveAsTpl, setShowSaveAsTpl] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [imgDropdownOpen, setImgDropdownOpen] = useState(false)
  const [imgInputValue, setImgInputValue] = useState('')
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
  const [logModal, setLogModal] = useState<{ id: string; name: string } | null>(null)
  const [logTail, setLogTail] = useState(200)
  const [logAutoScroll, setLogAutoScroll] = useState(true)
  const logViewerRef = useRef<HTMLPreElement>(null)
  const [deleteOpts, setDeleteOpts] = useState({ removeVolumes: false, removeImage: false })
  const [editContainer, setEditContainer] = useState<{ id: string } | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deployType, setDeployType] = useState<'image' | 'compose'>('image')
  const [deployForm, setDeployForm] = useState(createDefaultDeployForm)

  useEffect(() => {
    if (authenticated) void refetch()
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
    setSaveTemplateName('')
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

  const logsQuery = useQuery({
    queryKey: ['docker-container-logs', logModal?.id, logTail],
    queryFn: () => fetchContainerLogs(logModal!.id, logTail),
    enabled: !!logModal,
    refetchInterval: logModal ? 2_000 : false,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (!logAutoScroll || !logViewerRef.current) return
    logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight
  }, [logAutoScroll, logsQuery.data?.lines])

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
      return [name, container.Image, container.State, container.Status, container.Id, container.Health, container.RestartCount ? `restart ${container.RestartCount}` : '', networks, ips, ports]
        .filter((value): value is string => value !== undefined && value !== null && value !== '')
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [containers, search])

  const stats = useMemo(() => {
    const running = containers.filter((c) => c.State === 'running').length
    const withPublishedPorts = containers.filter((c) => (c.Ports ?? []).some((p) => p.PublicPort)).length
    const withIPs = containers.filter((c) => (c.IpAddresses ?? []).length > 0).length
    return { running, withPublishedPorts, withIPs }
  }, [containers])

  const deployReady =
    deployType === 'image'
      ? Boolean(deployForm.name.trim() && deployForm.image.trim())
      : Boolean(deployForm.name.trim() && deployForm.composeYaml.trim())

  return (
    <div className="panel-window docker-window-root">
      {/* ── Header ── */}
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Boxes className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">{t('docker.workspaceTitle')}</div>
            <div className="panel-window__meta">{t('docker.workspaceSubtitle')}</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button
            type="button"
            onClick={() => {
              void refetch(); void refetchNetworks(); void refetchImages(); void refetchTemplates()
            }}
            className="panel-icon-btn"
            aria-label={t('docker.refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openDeployModal} className="panel-btn panel-btn--primary-soft">
            <Plus className="h-3.5 w-3.5" />
            {t('docker.deploy')}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="docker-tabs">
        {(['containers', 'images', 'networks', 'templates'] as const).map((tab) => (
          <button
            key={tab}
            className={`docker-tab ${activeTab === tab ? 'docker-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`docker.tab.${tab}`)}
          </button>
        ))}
      </div>

      {/* ── Deploy Modal ── */}
      {showDeploy && (
        <div className="panel-modal-overlay docker-deploy-overlay">
          <div className="panel-modal-card docker-deploy-modal-card">
            <h3 className="docker-deploy-modal__title">
              {editContainer ? <Pencil className="panel-window__icon h-4 w-4" /> : <Boxes className="panel-window__icon h-4 w-4" />}
              {editContainer ? t('docker.editRedeploy') : t('docker.deployContainer')}
            </h3>

            <div className="docker-deploy-tabs">
              <button
                type="button"
                onClick={() => setDeployType('image')}
                className={`panel-btn justify-center text-[12px] font-semibold shadow-none ${deployType === 'image' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
              >
                <Box className="h-4 w-4" /> {t('docker.deployFromImage')}
              </button>
              <button
                type="button"
                onClick={() => setDeployType('compose')}
                className={`panel-btn justify-center text-[12px] font-semibold shadow-none ${deployType === 'compose' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
              >
                <Code className="h-4 w-4" /> {t('docker.deployFromCompose')}
              </button>
            </div>

            <div className="docker-deploy-modal__body">
              {/* Project / Container Name — combobox */}
              <div>
                <label className="panel-section-label">{t('docker.projectContainerName')}</label>
                <div className="docker-image-combobox" ref={nameComboRef}>
                  <div className="docker-image-combobox__input-wrap">
                    <input
                      value={deployForm.name}
                      onChange={(e) => !editContainer && setDeployForm({ ...deployForm, name: e.target.value })}
                      onFocus={() => { if (!editContainer) { setNameDropdownOpen(true); setImgDropdownOpen(false); setNetDropdownOpen(false) } }}
                      placeholder={t('docker.projectNamePlaceholder')}
                      className={`panel-input docker-image-combobox__input ${editContainer ? 'opacity-60 cursor-not-allowed' : ''}`}
                      autoComplete="off"
                      readOnly={!!editContainer}
                    />
                    {deployForm.name && !editContainer && (
                      <button type="button" className="docker-image-combobox__clear" onClick={() => { setDeployForm({ ...deployForm, name: '' }); setNameDropdownOpen(false) }} title={t('docker.clear')}>
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
                              setSaveTemplateName(tmpl.name)
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
                <div className="grid grid-cols-2 gap-6 mt-4">
                  <div className="space-y-4">
                    {/* Docker Image combobox */}
                    <div>
                      <label className="panel-section-label">{t('docker.dockerImageRequired')}</label>
                      <div className="docker-image-combobox" ref={imgComboRef}>
                        <div className="docker-image-combobox__input-wrap">
                          <input
                            value={deployForm.image}
                            onChange={(e) => { setDeployForm({ ...deployForm, image: e.target.value }); setImgInputValue(e.target.value) }}
                            onFocus={() => { setImgDropdownOpen(true); setNameDropdownOpen(false); setNetDropdownOpen(false) }}
                            placeholder={t('docker.imagePlaceholder')}
                            className="panel-input docker-image-combobox__input"
                            autoComplete="off"
                          />
                          {deployForm.image && (
                            <button type="button" className="docker-image-combobox__clear" onClick={() => { setDeployForm({ ...deployForm, image: '' }); setImgInputValue(''); setImgDropdownOpen(false) }} title={t('docker.clear')}>
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
                            registryAuth: { ...current.registryAuth, enabled: e.target.checked },
                          }))}
                        />
                        <span>{t('docker.useRegistryAuth')}</span>
                      </label>
                      {deployForm.registryAuth.enabled && (
                        <div className="docker-auth-grid">
                          <div className="panel-field">
                            <label className="panel-label">{t('docker.registry')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
                            <input
                              className="panel-input"
                              placeholder={t('docker.registryPlaceholder')}
                              value={deployForm.registryAuth.registry}
                              onChange={(e) => setDeployForm((current) => ({
                                ...current,
                                registryAuth: { ...current.registryAuth, registry: e.target.value },
                              }))}
                            />
                          </div>
                          <div className="panel-field">
                            <label className="panel-label">{t('docker.usernameEmailRequired')}</label>
                            <input
                              className="panel-input"
                              placeholder={t('docker.usernameEmailPlaceholder')}
                              value={deployForm.registryAuth.usernameOrEmail}
                              onChange={(e) => setDeployForm((current) => ({
                                ...current,
                                registryAuth: { ...current.registryAuth, usernameOrEmail: e.target.value },
                              }))}
                            />
                          </div>
                          <div className="panel-field docker-auth-grid__full">
                            <label className="panel-label">{t('docker.passwordRequired')}</label>
                            <input
                              type="password"
                              className="panel-input"
                              placeholder={t('docker.passwordPlaceholder')}
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
                      <label className="panel-section-label">{t('docker.network')}</label>
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
                            placeholder={t('docker.networkPlaceholder')}
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
                              title={t('docker.resetDefault')}
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
                              <span className="docker-image-combobox__item-name">{t('docker.defaultBridge')}</span>
                              {!deployForm.network && <Check className="h-3.5 w-3.5 ml-auto" />}
                            </button>
                            {(networksData?.items ?? [])
                              .filter((net) => !netInputValue || net.Name.toLowerCase().includes(netInputValue.toLowerCase()))
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
                                  <span className="docker-image-combobox__item-size">{net.Driver}</span>
                                  {deployForm.network === net.Name && <Check className="h-3.5 w-3.5 ml-auto" />}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: ports, env, volumes */}
                  <div className="space-y-4">
                    {/* Ports */}
                    <div>
                      <label className="panel-section-label">{t('docker.ports')}</label>
                      {deployForm.ports.map((port, idx) => (
                        <div key={idx} className="docker-port-row">
                          <input
                            className="panel-input docker-port-input"
                            placeholder={t('docker.hostPortPlaceholder')}
                            value={port.hostPort}
                            onChange={(e) => {
                              const ports = [...deployForm.ports]
                              ports[idx] = { ...ports[idx], hostPort: e.target.value }
                              setDeployForm({ ...deployForm, ports })
                            }}
                          />
                          <span className="docker-port-sep">:</span>
                          <input
                            className="panel-input docker-port-input"
                            placeholder={t('docker.containerPortPlaceholder')}
                            value={port.containerPort}
                            onChange={(e) => {
                              const ports = [...deployForm.ports]
                              ports[idx] = { ...ports[idx], containerPort: e.target.value }
                              setDeployForm({ ...deployForm, ports })
                            }}
                          />
                          {deployForm.ports.length > 1 && (
                            <button
                              type="button"
                              className="panel-icon-btn text-[var(--panel-danger-text)]"
                              onClick={() => {
                                const ports = deployForm.ports.filter((_, i) => i !== idx)
                                setDeployForm({ ...deployForm, ports })
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="panel-btn panel-btn--ghost text-[12px]"
                        onClick={() => setDeployForm({ ...deployForm, ports: [...deployForm.ports, { hostPort: '', containerPort: '' }] })}
                      >
                        <Plus className="h-3 w-3" /> {t('docker.addPort')}
                      </button>
                    </div>

                    {/* Environment Variables */}
                    <div>
                      <label className="panel-section-label">{t('docker.environmentVariables')}</label>
                      <div className="mb-2 flex gap-2">
                        <button
                          type="button"
                          className={`panel-btn panel-btn--ghost text-[12px] ${deployForm.envMode === 'form' ? 'panel-btn--active' : ''}`}
                          onClick={() => {
                            if (deployForm.envMode === 'form') return
                            setDeployForm({ ...deployForm, envMode: 'form', env: toEnvRows(deployForm.envRaw) })
                          }}
                        >
                          {t('docker.envFormMode')}
                        </button>
                        <button
                          type="button"
                          className={`panel-btn panel-btn--ghost text-[12px] ${deployForm.envMode === 'raw' ? 'panel-btn--active' : ''}`}
                          onClick={() => {
                            if (deployForm.envMode === 'raw') return
                            setDeployForm({ ...deployForm, envMode: 'raw', envRaw: toRawEnv(deployForm.env) })
                          }}
                        >
                          {t('docker.envRawMode')}
                        </button>
                      </div>
                      {deployForm.envMode === 'form' ? (
                        <>
                          {deployForm.env.map((envRow, idx) => (
                            <div key={idx} className="docker-env-row">
                              <input
                                className="panel-input docker-env-key"
                                placeholder={t('docker.envKeyPlaceholder')}
                                value={envRow.key}
                                onChange={(e) => {
                                  const env = [...deployForm.env]
                                  env[idx] = { ...env[idx], key: e.target.value }
                                  setDeployForm({ ...deployForm, env })
                                }}
                              />
                              <input
                                className="panel-input docker-env-value"
                                placeholder={t('docker.envValuePlaceholder')}
                                value={envRow.value}
                                onChange={(e) => {
                                  const env = [...deployForm.env]
                                  env[idx] = { ...env[idx], value: e.target.value }
                                  setDeployForm({ ...deployForm, env })
                                }}
                              />
                              {deployForm.env.length > 1 && (
                                <button
                                  type="button"
                                  className="panel-icon-btn text-[var(--panel-danger-text)]"
                                  onClick={() => {
                                    const env = deployForm.env.filter((_, i) => i !== idx)
                                    setDeployForm({ ...deployForm, env: env.length > 0 ? env : [EMPTY_ENV_ROW] })
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            className="panel-btn panel-btn--ghost text-[12px]"
                            onClick={() => setDeployForm({ ...deployForm, env: [...deployForm.env, { key: '', value: '' }] })}
                          >
                            <Plus className="h-3 w-3" /> {t('docker.addEnv')}
                          </button>
                        </>
                      ) : (
                        <textarea
                          className="panel-input docker-modal__yaml"
                          rows={6}
                          placeholder={t('docker.envRawPlaceholder')}
                          value={deployForm.envRaw}
                          onChange={(e) => setDeployForm({ ...deployForm, envRaw: e.target.value })}
                        />
                      )}
                    </div>

                    {/* Volumes */}
                    <div>
                      <label className="panel-section-label">{t('docker.volumes')}</label>
                      {deployForm.volumes.map((vol, idx) => (
                        <div key={idx} className="docker-port-row">
                          <input
                            className="panel-input docker-port-input"
                            placeholder={t('docker.hostPathPlaceholder')}
                            value={vol.hostPath}
                            onChange={(e) => {
                              const volumes = [...deployForm.volumes]
                              volumes[idx] = { ...volumes[idx], hostPath: e.target.value }
                              setDeployForm({ ...deployForm, volumes })
                            }}
                          />
                          <span className="docker-port-sep">:</span>
                          <input
                            className="panel-input docker-port-input"
                            placeholder={t('docker.containerPathPlaceholder')}
                            value={vol.containerPath}
                            onChange={(e) => {
                              const volumes = [...deployForm.volumes]
                              volumes[idx] = { ...volumes[idx], containerPath: e.target.value }
                              setDeployForm({ ...deployForm, volumes })
                            }}
                          />
                          {deployForm.volumes.length > 1 && (
                            <button
                              type="button"
                              className="panel-icon-btn text-[var(--panel-danger-text)]"
                              onClick={() => {
                                const volumes = deployForm.volumes.filter((_, i) => i !== idx)
                                setDeployForm({ ...deployForm, volumes })
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="panel-btn panel-btn--ghost text-[12px]"
                        onClick={() => setDeployForm({ ...deployForm, volumes: [...deployForm.volumes, { hostPath: '', containerPath: '' }] })}
                      >
                        <Plus className="h-3 w-3" /> {t('docker.addVolume')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Compose YAML editor */
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="panel-section-label">{t('docker.composeYamlRequired')}</label>
                    <textarea
                      className="panel-input docker-modal__yaml"
                      rows={16}
                      value={deployForm.composeYaml}
                      onChange={(e) => setDeployForm({ ...deployForm, composeYaml: e.target.value })}
                    />
                  </div>
                  <label className="docker-save-tpl-check">
                    <input
                      type="checkbox"
                      checked={showSaveAsTpl}
                      onChange={(e) => {
                        setShowSaveAsTpl(e.target.checked)
                        if (e.target.checked && !saveTemplateName) setSaveTemplateName(deployForm.name)
                      }}
                    />
                    <span>{t('docker.saveAsTemplate')}</span>
                  </label>
                  {showSaveAsTpl && (
                    <div className="panel-field">
                      <label className="panel-label">{t('docker.templateName')}</label>
                      <input
                        className="panel-input"
                        placeholder={t('docker.composeTemplateNamePlaceholder')}
                        value={saveTemplateName}
                        onChange={(e) => setSaveTemplateName(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Deploy modal footer */}
            <div className="mt-4 flex gap-2">
              <button className="panel-btn panel-btn--ghost flex-1" onClick={resetDeployModal}>
                {t('common.cancel')}
              </button>
              <button
                className="panel-btn panel-btn--primary flex-1"
                disabled={!deployReady || deployImageMut.isPending || deployComposeMut.isPending}
                onClick={() => {
                  if (deployType === 'image') {
                    deployImageMut.mutate(
                      {
                        name: deployForm.name.trim(),
                        image: deployForm.image.trim(),
                        network: deployForm.network.trim() || undefined,
                        ports: deployForm.ports
                          .filter((p) => p.containerPort.trim())
                          .map((p) => ({
                            hostIp: '0.0.0.0',
                            hostPort: p.hostPort.trim(),
                            containerPort: p.containerPort.trim(),
                            protocol: 'tcp',
                          })),
                        env: deployForm.envMode === 'form'
                          ? deployForm.env.filter((e) => e.key.trim()).map((e) => ({ key: e.key.trim(), value: e.value }))
                          : toEnvRows(deployForm.envRaw).filter((e) => e.key.trim()),
                        volumes: deployForm.volumes
                          .filter((v) => v.containerPath.trim())
                          .map((v) => ({ hostPath: v.hostPath.trim(), containerPath: v.containerPath.trim() })),
                        registryAuth: deployForm.registryAuth.enabled
                          ? { enabled: true, registry: deployForm.registryAuth.registry || undefined, usernameOrEmail: deployForm.registryAuth.usernameOrEmail, password: deployForm.registryAuth.password }
                          : undefined,
                      },
                      {
                        onSuccess: () => {
                          toast.success(editContainer ? t('docker.containerRedeployed') : t('docker.containerDeployed'))
                          resetDeployModal()
                          void refetch()
                        },
                        onError: (e: any) => alertLib.fire(t('docker.deployFailed'), e.response?.data?.error || t('docker.unknownError'), 'error', 'apps'),
                      },
                    )
                  } else {
                    deployComposeMut.mutate(
                      {
                        name: deployForm.name.trim(),
                        composeYaml: deployForm.composeYaml,
                      },
                      {
                        onSuccess: async () => {
                          toast.success(t('docker.composeProjectDeployed', { name: deployForm.name }))
                          if (showSaveAsTpl && saveTemplateName.trim()) {
                            try {
                              await createTemplateMut.mutateAsync({ name: saveTemplateName.trim(), description: '', yamlContent: deployForm.composeYaml })
                              toast.success(t('docker.templateSaved'))
                            } catch { /* silent */ }
                          }
                          resetDeployModal()
                          void refetch()
                        },
                        onError: (e: any) => alertLib.fire(t('docker.composeDeployFailed'), e.response?.data?.error || t('docker.unknownError'), 'error', 'apps'),
                      },
                    )
                  }
                }}
              >
                {(deployImageMut.isPending || deployComposeMut.isPending) ? (
                  <>
                    <DeployStep label={t('docker.pullingImage')} delay={0} />
                    <DeployStep label={t('docker.creatingContainer')} delay={1200} />
                    <DeployStep label={t('docker.starting')} delay={2400} />
                  </>
                ) : editContainer ? t('docker.redeploy') : t('docker.deploy')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Container Modal ── */}
      {deleteConfirm && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card" style={{ width: 'min(100%, 440px)' }}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <Trash2 className="h-4 w-4 text-[var(--panel-danger-text)]" />
              {t('docker.deleteContainerTitle')}
            </h3>
            <p className="mb-4 text-[12px] text-[var(--text-secondary)] leading-relaxed">
              {t('docker.deleteContainerDescription', { name: deleteConfirm.name })}
            </p>
            <div className="space-y-3 mb-5">
              <label className="docker-save-tpl-check">
                <input type="checkbox" checked={deleteOpts.removeVolumes} onChange={(e) => setDeleteOpts((v) => ({ ...v, removeVolumes: e.target.checked }))} />
                <span>{t('docker.deleteVolumesData')}</span>
                <span className="docker-save-tpl-check__name text-[var(--panel-danger-text)]">(-v)</span>
              </label>
              <label className="docker-save-tpl-check">
                <input type="checkbox" checked={deleteOpts.removeImage} onChange={(e) => setDeleteOpts((v) => ({ ...v, removeImage: e.target.checked }))} />
                <span>{t('docker.removeImage')}</span>
                <span className="docker-save-tpl-check__name font-mono text-[12px]">{deleteConfirm.image}</span>
              </label>
              {deleteOpts.removeImage && (
                <p className="text-[12px] text-[var(--panel-warning-text)] pl-5 leading-relaxed">
                  {t('docker.removeImageWarning')}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="panel-btn panel-btn--ghost flex-1">{t('common.cancel')}</button>
              <button
                onClick={() => {
                  deleteMutation.mutate({ id: deleteConfirm.id, opts: deleteOpts })
                  setDeleteConfirm(null)
                }}
                disabled={deleteMutation.isPending}
                className="panel-btn panel-btn--danger flex-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteMutation.isPending ? t('docker.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log Modal ── */}
      {logModal && (
        <div className="docker-modal-overlay" onClick={() => setLogModal(null)}>
          <div className="docker-modal docker-log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="docker-modal__header">
              <div>
                <span className="docker-modal__title">{t('docker.realtimeLogs')}</span>
                <div className="panel-window__meta">{t('docker.refreshEverySeconds', { name: logModal.name })}</div>
              </div>
              <button type="button" className="panel-icon-btn" onClick={() => setLogModal(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="docker-modal__body">
              <div className="docker-log-toolbar">
                <div className="docker-log-toolbar__left">
                  <span className="panel-badge panel-badge--neutral">tail {logTail}</span>
                  {logsQuery.isFetching && <span className="panel-badge panel-badge--info">{t('docker.syncing')}</span>}
                </div>
                <div className="docker-log-toolbar__right">
                  <label className="docker-log-autoscroll">
                    <input type="checkbox" checked={logAutoScroll} onChange={(e) => setLogAutoScroll(e.target.checked)} />
                    <span>{t('docker.autoScroll')}</span>
                  </label>
                  <PanelSelectMenu
                    id="docker-log-tail-select"
                    value={String(logTail)}
                    onChange={(value: string) => setLogTail(Number(value))}
                    options={[
                      { value: '100', label: t('docker.lines', { count: 100 }) },
                      { value: '200', label: t('docker.lines', { count: 200 }) },
                      { value: '500', label: t('docker.lines', { count: 500 }) },
                      { value: '1000', label: t('docker.lines', { count: 1000 }) },
                    ]}
                    className="min-w-[140px]"
                    buttonClassName="h-[34px] rounded-[10px] py-0 text-[12px]"
                    dropdownClassName="left-auto right-0 min-w-[160px]"
                  />
                  <button type="button" className="panel-btn panel-btn--ghost" onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}>
                    <RefreshCw className={`h-3.5 w-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
                    {t('common.refresh')}
                  </button>
                </div>
              </div>
              {logsQuery.isError ? (
                <div className="panel-empty panel-empty--danger">{t('docker.logLoadFailed')}</div>
              ) : (
                <pre ref={logViewerRef} className="docker-log-viewer">
                  {(logsQuery.data?.lines ?? []).length > 0
                    ? logsQuery.data?.lines.join('\n')
                    : logsQuery.isLoading
                      ? t('docker.loadingLogs')
                      : t('docker.noLogs')}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        {/* ── Containers Tab ── */}
        {activeTab === 'containers' && (
          <div className="panel-window__stack">
            <div className="docker-summary-grid">
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Layers3 className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">{t('docker.totalContainers')}</div>
                  <div className="docker-summary-card__value">{containers.length}</div>
                </div>
              </div>
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Activity className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">{t('docker.running')}</div>
                  <div className="docker-summary-card__value">{stats.running}</div>
                </div>
              </div>
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Server className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">{t('docker.activeIp')}</div>
                  <div className="docker-summary-card__value">{stats.withIPs}</div>
                </div>
              </div>
              <div className="panel-card docker-summary-card">
                <div className="docker-summary-card__icon"><Box className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">{t('docker.publishedPorts')}</div>
                  <div className="docker-summary-card__value">{stats.withPublishedPorts}</div>
                </div>
              </div>
            </div>

            <div className="panel-table-container">
              <div className="panel-toolbar panel-toolbar--search docker-toolbar-card">
                <form className="panel-search" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()) }}>
                  <Search className="h-4 w-4" />
                  <input
                    id="docker-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="panel-search__input"
                    placeholder={t('docker.searchContainers')}
                  />
                  <button type="submit" className="panel-btn panel-btn--primary-soft">{t('common.search')}</button>
                </form>
              </div>

              {isLoading ? (
                <div className="panel-loading">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t('docker.connectingAgent')}
                </div>
              ) : isError ? (
                <div className="panel-error-state">
                  <ContainerIcon className="h-5 w-5" />
                  <div>
                    <p className="font-semibold">{t('docker.containersLoadFailed')}</p>
                    <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
                    <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.agentAccessHint')}</p>
                  </div>
                </div>
              ) : filteredContainers.length === 0 ? (
                <div className="panel-empty panel-empty--wide">
                  <Boxes className="h-8 w-8" />
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-[var(--win-text)]">{t('docker.noContainersMatch')}</div>
                    <div>{t('docker.emptyContainersHint')}</div>
                  </div>
                </div>
              ) : (
                <>
                  {filteredContainers.map((container) => {
                    const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
                    const stateStyle = STATE_STYLES[container.State] ?? STATE_STYLES.dead
                    const runtimeIssues = getContainerRuntimeIssues(container)
                    const ActionIcon = stateStyle.actionIcon
                    const { primaryPublished, internal, published } = getContainerPorts(container)
                    const networks = container.Networks?.length ? container.Networks.join(', ') : 'bridge/default'
                    const ipAddresses = container.IpAddresses?.length ? container.IpAddresses.join(', ') : t('docker.unavailable')

                    return (
                      <div key={container.Id} className="panel-table-row">
                        <div className="docker-container-row__main">
                          <div className="docker-container-row__header">
                            <div className="docker-container-card__title-wrap">
                              <div className="docker-container-card__title-row">
                                <span className="docker-container-card__title">{name}</span>
                                <StatusBadge state={container.State} />
                              </div>
                              <div className="docker-container-card__subtitle">{container.Image}</div>
                              <div className="docker-container-card__meta-row">
                                <span className="docker-inline-code">ID {container.Id.slice(0, 12)}</span>
                                <span className="docker-inline-code">Network {networks}</span>
                                <span className="docker-inline-code">IP {ipAddresses}</span>
                                <span className="docker-inline-code">Port {primaryPublished}</span>
                                <span className="docker-inline-dot" />
                                <span>{container.Status}</span>
                                {runtimeIssues.map((issue) => (
                                  <span key={`${container.Id}-${issue.key}`} className={`panel-badge ${issue.tone === 'danger' ? 'panel-badge--danger' : 'panel-badge--warning'}`}>
                                    {issue.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="docker-container-row__actions">
                              <button
                                type="button"
                                className="panel-icon-btn"
                                title={t('docker.editRedeploy')}
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
                                        ? cfg.ports.map((p: any) => ({ hostIp: p.hostIp || '', hostPort: p.hostPort || '', containerPort: p.containerPort || '', protocol: p.protocol || 'tcp' }))
                                        : [{ hostPort: '', containerPort: '' }],
                                      env: envRows,
                                      envMode: cfg.envMode || 'form',
                                      envRaw,
                                      registryAuth: createEmptyRegistryAuth(),
                                      volumes: cfg.volumes.length > 0
                                        ? cfg.volumes.map((v: any) => ({ hostPath: v.hostPath, containerPath: v.containerPath }))
                                        : [{ hostPath: '', containerPath: '' }],
                                      composeYaml: DEFAULT_COMPOSE_YAML,
                                    })
                                    setEditContainer({ id: container.Id })
                                    setShowDeploy(true)
                                  } catch {
                                    toast.error(t('docker.configLoadFailed'))
                                  } finally {
                                    setEditLoading(false)
                                  }
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="panel-icon-btn"
                                title={t('docker.viewRealtimeLog')}
                                onClick={() => { setLogAutoScroll(true); setLogModal({ id: container.Id, name }) }}
                              >
                                <ScrollText className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="panel-icon-btn panel-icon-btn--warning"
                                onClick={() => restartMutation.mutate(container.Id)}
                                disabled={restartMutation.isPending}
                                title={t('docker.restartContainer')}
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
                                title={t('docker.deleteContainer')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {(internal.length > 1 || published.length > 1) && (
                            <div className="docker-token-groups docker-token-groups--inline">
                              {internal.length > 1 && (
                                <div className="docker-token-group">
                                  <div className="docker-port-section__label">{t('docker.otherInternalPorts')}</div>
                                  <div className="docker-token-row">
                                    {internal.slice(1).map((value) => <MetaChip key={value} value={value} />)}
                                  </div>
                                </div>
                              )}
                              {published.length > 1 && (
                                <div className="docker-token-group">
                                  <div className="docker-port-section__label">{t('docker.otherForwards')}</div>
                                  <div className="docker-token-row">
                                    {published.slice(1).map((value) => <MetaChip key={value} value={value} tone="primary" />)}
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

        {/* ── Images Tab ── */}
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
                    <span className="docker-tab-toolbar__title">{t('docker.localImages')}</span>
                    <span className="panel-badge panel-badge--neutral">{allImgs.length}</span>
                  </div>
                  <div className="docker-tab-toolbar__right">
                    <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => { e.preventDefault(); setImgPage(1) }}>
                      <Search className="h-3.5 w-3.5" />
                      <input className="panel-search__input" placeholder={t('docker.searchImageShort')} value={imgSearch} onChange={(e) => { setImgSearch(e.target.value); setImgPage(1) }} />
                    </form>
                    <button type="button" className="panel-btn panel-btn--primary-soft" onClick={() => setShowPullImage(true)} disabled={pullImageMut.isPending}>
                      <Plus className="h-3.5 w-3.5" /> {t('docker.pullImage')}
                    </button>
                  </div>
                </div>

                {/* Pull Image Modal */}
                {showPullImage && (
                  <div className="docker-modal-overlay" onClick={resetPullImageModal}>
                    <div className="docker-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="docker-modal__header">
                        <span className="docker-modal__title">{t('docker.pullDockerImage')}</span>
                        <button type="button" className="panel-icon-btn" onClick={resetPullImageModal}><X className="h-4 w-4" /></button>
                      </div>
                      <div className="docker-modal__body">
                        <div className="panel-field">
                          <label className="panel-label">{t('docker.imageRequired')}</label>
                          <input className="panel-input" placeholder={t('docker.pullImagePlaceholder')} value={pullImageForm.image} onChange={(e) => setPullImageForm((c) => ({ ...c, image: e.target.value }))} />
                        </div>
                        <div className="docker-auth-block">
                          <label className="docker-save-tpl-check">
                            <input type="checkbox" checked={pullImageForm.registryAuth.enabled} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, enabled: e.target.checked } }))} />
                            <span>{t('docker.useRegistryAuth')}</span>
                          </label>
                          {pullImageForm.registryAuth.enabled && (
                            <div className="docker-auth-grid">
                              <div className="panel-field">
                                <label className="panel-label">{t('docker.registry')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
                                <input className="panel-input" placeholder={t('docker.registryPlaceholder')} value={pullImageForm.registryAuth.registry} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, registry: e.target.value } }))} />
                              </div>
                              <div className="panel-field">
                                <label className="panel-label">{t('docker.usernameEmailRequired')}</label>
                                <input className="panel-input" placeholder={t('docker.usernameEmailPlaceholder')} value={pullImageForm.registryAuth.usernameOrEmail} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, usernameOrEmail: e.target.value } }))} />
                              </div>
                              <div className="panel-field docker-auth-grid__full">
                                <label className="panel-label">{t('docker.passwordRequired')}</label>
                                <input type="password" className="panel-input" placeholder={t('docker.passwordPlaceholder')} value={pullImageForm.registryAuth.password} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, password: e.target.value } }))} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="docker-modal__footer">
                        <button type="button" className="panel-btn panel-btn--ghost" onClick={resetPullImageModal}>{t('common.cancel')}</button>
                        <button
                          type="button"
                          className="panel-btn panel-btn--primary"
                          disabled={pullImageMut.isPending || !pullImageForm.image.trim()}
                          onClick={() => {
                            pullImageMut.mutate(
                              {
                                image: pullImageForm.image.trim(),
                                registryAuth: pullImageForm.registryAuth.enabled
                                  ? { enabled: true, registry: pullImageForm.registryAuth.registry || undefined, usernameOrEmail: pullImageForm.registryAuth.usernameOrEmail, password: pullImageForm.registryAuth.password }
                                  : undefined,
                              },
                              {
                                onSuccess: () => { toast.success(t('docker.imagePulled', { image: pullImageForm.image.trim() })); resetPullImageModal(); void refetchImages() },
                                onError: (e: any) => alertLib.fire(t('docker.pullImageFailed'), e.response?.data?.error || t('docker.unknownError'), 'error', 'apps'),
                              },
                            )
                          }}
                        >
                          {pullImageMut.isPending ? t('docker.pulling') : t('docker.pullImage')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {pagedImgs.length === 0 ? (
                  <div className="panel-empty panel-empty--wide">
                    <Box className="h-8 w-8" />
                    <div className="text-sm font-medium text-[var(--win-text)]">{imgSearch ? t('docker.noResults') : t('docker.noLocalImages')}</div>
                  </div>
                ) : (
                  <>
                    {pagedImgs.map((img) => (
                      <div key={img.Id} className="panel-table-row">
                        <div className="row-top">
                          <div className="docker-flat-row__info">
                            <span className="docker-flat-row__name">{img.Repository}</span>
                            <span className="panel-badge panel-badge--neutral">{img.Tag}</span>
                          </div>
                          <button
                            type="button"
                            className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                            onClick={async () => {
                              const imageLabel = `${img.Repository}:${img.Tag}`
                              const ok = await alertLib.confirm(t('docker.deleteImage'), t('docker.deleteImageConfirm', { image: imageLabel }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
                              if (!ok) return
                              deleteImageMut.mutate(img.Id, {
                                onSuccess: () => { toast.success(t('docker.imageDeleted', { image: imageLabel })); void refetchImages() },
                                onError: (e: any) => alertLib.fire(t('docker.deleteImageFailed'), e.response?.data?.error || t('docker.imageDeleteFailed'), 'error', 'apps'),
                              })
                            }}
                            disabled={deleteImageMut.isPending}
                            title={t('docker.deleteImage')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="docker-flat-row__desc">
                          <span className="panel-badge panel-badge--detail">
                            ID : {img.Id.slice(0, 12)}<br />
                            {t('docker.size')} : {img.Size}<br />
                            {t('docker.createdLabel')} : {formatDateTimeID(img.CreatedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {totalPages > 1 && (
                  <div className="panel-pagination">
                    <button className="panel-btn panel-btn--ghost" disabled={imgPage <= 1} onClick={() => setImgPage((v) => Math.max(1, v - 1))}><ChevronLeft className="h-3.5 w-3.5" /> {t('docker.prev')}</button>
                    <span className="text-[12px] text-[var(--text-secondary)] font-medium">{t('docker.pageOf', { page: imgPage, total: totalPages })}</span>
                    <button className="panel-btn panel-btn--ghost" disabled={imgPage >= totalPages} onClick={() => setImgPage((v) => Math.min(totalPages, v + 1))}>{t('docker.next')} <ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── Networks Tab ── */}
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
                      <span className="docker-modal__title">{t('docker.createNetworkTitle')}</span>
                      <button type="button" className="panel-icon-btn" onClick={() => setShowCreateNet(false)}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="docker-modal__body">
                      <div className="panel-field">
                        <label className="panel-label">{t('docker.networkNameRequired')}</label>
                        <input className="panel-input" placeholder={t('docker.networkNamePlaceholder')} value={netForm.name} onChange={(e) => setNetForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">{t('docker.subnetCidr')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
                        <input className="panel-input" placeholder={t('docker.subnetPlaceholder')} value={netForm.subnet} onChange={(e) => setNetForm((f) => ({ ...f, subnet: e.target.value }))} />
                        <p className="panel-hint">{t('docker.ipRangeHint')} <code>172.20.0.0/16</code></p>
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">{t('docker.gateway')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
                        <input className="panel-input" placeholder={t('docker.gatewayPlaceholder')} value={netForm.gateway} onChange={(e) => setNetForm((f) => ({ ...f, gateway: e.target.value }))} />
                        <p className="panel-hint">{t('docker.gatewayHint')} <code>172.20.0.1</code></p>
                      </div>
                    </div>
                    <div className="docker-modal__footer">
                      <button type="button" className="panel-btn panel-btn--ghost" onClick={() => setShowCreateNet(false)}>{t('common.cancel')}</button>
                      <button
                        type="button"
                        className="panel-btn panel-btn--primary"
                        disabled={createNetworkMut.isPending || !netForm.name.trim()}
                        onClick={async () => {
                          await createNetworkMut.mutateAsync({ name: netForm.name.trim(), subnet: netForm.subnet.trim() || undefined, gateway: netForm.gateway.trim() || undefined })
                          toast.success(t('docker.networkCreated', { name: netForm.name }))
                          setShowCreateNet(false)
                          setNetForm({ name: '', subnet: '', gateway: '' })
                        }}
                      >
                        {createNetworkMut.isPending ? t('common.creating') : t('docker.createNetwork')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="panel-table-container">
                <div className="docker-tab-toolbar">
                  <div className="docker-tab-toolbar__left">
                    <span className="docker-tab-toolbar__title">{t('docker.dockerNetworks')}</span>
                    <span className="panel-badge panel-badge--neutral">{allNets.length}</span>
                  </div>
                  <div className="docker-tab-toolbar__right">
                    <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => e.preventDefault()}>
                      <Search className="h-3.5 w-3.5" />
                      <input className="panel-search__input" placeholder={t('docker.searchNetworkShort')} value={netSearch} onChange={(e) => setNetSearch(e.target.value)} />
                    </form>
                    <button type="button" className="panel-btn panel-btn--primary-soft" onClick={() => setShowCreateNet(true)} disabled={createNetworkMut.isPending}>
                      <Plus className="h-3.5 w-3.5" /> {t('docker.createNetwork')}
                    </button>
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
                              const ok = await alertLib.confirm(t('docker.deleteNetwork'), t('docker.deleteNetworkConfirm', { name: net.Name }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
                              if (ok) deleteNetworkMut.mutate(net.Id)
                            }}
                            disabled={deleteNetworkMut.isPending}
                            title={t('docker.deleteNetwork')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="docker-flat-row__desc">
                          <span className="panel-badge panel-badge--detail">
                            {t('docker.scope')} : {net.Scope}<br />
                            {t('docker.subnet')} : {net.Subnet}<br />
                            {t('docker.gateway')} : {net.Gateway}<br />
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

        {/* ── Templates Tab ── */}
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
                      <span className="docker-modal__title">{t('docker.createTemplateTitle')}</span>
                      <button type="button" className="panel-icon-btn" onClick={() => setShowCreateTpl(false)}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="docker-modal__body">
                      <div className="panel-field">
                        <label className="panel-label">{t('docker.templateName')}</label>
                        <input className="panel-input" placeholder={t('docker.templateNamePlaceholder')} value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">{t('docker.description')}</label>
                        <input className="panel-input" placeholder={t('docker.descriptionPlaceholder')} value={tplForm.description} onChange={(e) => setTplForm((f) => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div className="panel-field">
                        <label className="panel-label">{t('docker.composeYaml')}</label>
                        <textarea className="panel-input docker-modal__yaml" rows={10} value={tplForm.yamlContent} onChange={(e) => setTplForm((f) => ({ ...f, yamlContent: e.target.value }))} />
                      </div>
                    </div>
                    <div className="docker-modal__footer">
                      <button type="button" className="panel-btn panel-btn--ghost" onClick={() => setShowCreateTpl(false)}>{t('common.cancel')}</button>
                      <button
                        type="button"
                        className="panel-btn panel-btn--primary"
                        disabled={createTemplateMut.isPending || !tplForm.name.trim()}
                        onClick={async () => {
                          await createTemplateMut.mutateAsync(tplForm)
                          toast.success(t('docker.templateCreated'))
                          setShowCreateTpl(false)
                          setTplForm({ name: '', description: '', yamlContent: DEFAULT_COMPOSE_YAML })
                        }}
                      >
                        {createTemplateMut.isPending ? t('common.saving') : t('docker.saveTemplate')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="panel-table-container">
                <div className="docker-tab-toolbar">
                  <div className="docker-tab-toolbar__left">
                    <span className="docker-tab-toolbar__title">{t('docker.composeTemplates')}</span>
                    <span className="panel-badge panel-badge--neutral">{allTpls.length}</span>
                  </div>
                  <div className="docker-tab-toolbar__right">
                    <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => e.preventDefault()}>
                      <Search className="h-3.5 w-3.5" />
                      <input className="panel-search__input" placeholder={t('docker.searchTemplateShort')} value={tplSearch} onChange={(e) => setTplSearch(e.target.value)} />
                    </form>
                    <button type="button" className="panel-btn panel-btn--primary" onClick={() => setShowCreateTpl(true)}>
                      <Plus className="h-3.5 w-3.5" /> {t('docker.createTemplate')}
                    </button>
                  </div>
                </div>
                {filteredTpls.length === 0 ? (
                  <div className="panel-empty panel-empty--wide">
                    <Code className="h-8 w-8" />
                    <div className="text-sm font-medium text-[var(--win-text)]">{tplSearch ? t('docker.noResults') : t('docker.noTemplates')}</div>
                  </div>
                ) : (
                  <>
                    {filteredTpls.map((tmpl) => (
                      <div key={tmpl.id} className="panel-table-row">
                        <div className="row-top">
                          <div className="docker-flat-row__info">
                            <span className="docker-flat-row__name">{tmpl.name}</span>
                            {tmpl.description && <span className="panel-badge panel-badge--neutral">{tmpl.description}</span>}
                          </div>
                          <div className="docker-flat-row__actions">
                            <button
                              type="button"
                              className="panel-btn panel-btn--primary-soft"
                              onClick={() => {
                                setDeployType('compose')
                                setDeployForm((f) => ({ ...f, name: tmpl.name, composeYaml: tmpl.yamlContent }))
                                setShowDeploy(true)
                              }}
                            >
                              <Play className="h-3.5 w-3.5" /> {t('docker.use')}
                            </button>
                            <button
                              type="button"
                              className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                              onClick={async () => {
                                const ok = await alertLib.confirm(t('docker.deleteTemplate'), t('docker.deleteTemplateConfirm', { name: tmpl.name }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
                                if (ok) deleteTemplateMut.mutate(tmpl.id)
                              }}
                              disabled={deleteTemplateMut.isPending}
                              title={t('docker.deleteTemplate')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="docker-flat-row__desc">
                          <span className="panel-badge panel-badge--detail">
                            {t('docker.created')} : {formatDateTimeID(tmpl.createdAt)}
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




