import { type WindowState } from '@/types'
import {
  useContainers,
  useStartContainer,
  useStopContainer,
  useRestartContainer,
  useDeleteContainer,
  useDeployImageContainer,
  useDeployComposeProject,
  useDockerNetworks,
  useDockerVolumes,
  useDockerImages,
  useDockerTemplates,
  useCreateDockerNetwork,
  useDeleteDockerNetwork,
  useDeleteDockerImage,
  usePullDockerImage,
  useDeleteDockerTemplate,
  useCreateDockerTemplate,
} from '@/hooks/useContainers'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { useI18n } from '@/lib/i18n'
import type { Container } from '@/types'
import { useDockerLists } from './useDockerLists'
import { DEFAULT_COMPOSE_YAML, createDefaultDeployForm, createDefaultPullImageForm, type DockerTab } from './constants'

export function useDockerWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const pollingActive = useWindowPollingActive(win)
  const { t } = useI18n()
  const [activeTab, setActiveTabState] = useState<DockerTab>('containers')
  const { data, isLoading, isError, error, refetch, isFetching } = useContainers(pollingActive)
  // only the tab on screen is polled
  const networksQuery = useDockerNetworks(pollingActive && activeTab === 'networks')
  const imagesQuery = useDockerImages(pollingActive && activeTab === 'images')
  const volumesQuery = useDockerVolumes(pollingActive && activeTab === 'volumes')
  const templatesQuery = useDockerTemplates()
  const { data: networksData, refetch: refetchNetworks } = networksQuery
  const { data: imagesData, refetch: refetchImages } = imagesQuery
  const { data: volumesData, refetch: refetchVolumes } = volumesQuery
  const { data: templatesData, refetch: refetchTemplates } = templatesQuery

  // One search box in the toolbar filters whichever tab is open; changing tab clears it
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const setActiveTab = (tab: DockerTab) => {
    setActiveTabState(tab)
    setQuery('')
  }

  // Networks tab state
  const [showCreateNet, setShowCreateNet] = useState(false)
  const [netForm, setNetForm] = useState({ name: '', subnet: '', gateway: '' })

  // Templates tab state
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

  const [tabDropdownOpen, setTabDropdownOpen] = useState(false)
  const tabDropdownRef = useRef<HTMLDivElement>(null)
  // Refs for click-outside to close dropdowns
  const imgComboRef = useRef<HTMLDivElement>(null)
  const nameComboRef = useRef<HTMLDivElement>(null)
  const netComboRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tabDropdownRef.current && !tabDropdownRef.current.contains(e.target as Node)) setTabDropdownOpen(false)
      if (imgComboRef.current && !imgComboRef.current.contains(e.target as Node)) setImgDropdownOpen(false)
      if (nameComboRef.current && !nameComboRef.current.contains(e.target as Node)) setNameDropdownOpen(false)
      if (netComboRef.current && !netComboRef.current.contains(e.target as Node)) setNetDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; image: string } | null>(null)
  const [logModal, setLogModal] = useState<{ id: string; name: string } | null>(null)
  const [deleteOpts, setDeleteOpts] = useState({ removeVolumes: false, removeImage: false })
  const [editContainer, setEditContainer] = useState<{ id: string } | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  // the container whose domain is being pointed through a Cloudflare tunnel
  const [domainContainer, setDomainContainer] = useState<Container | null>(null)
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

  const containers = useMemo(() => {
    const rawContainers = Array.isArray(data) ? data : []
    return rawContainers.filter((container) => {
      const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
      return !name.toLowerCase().includes('portainer') && !container.Image.toLowerCase().includes('portainer')
    })
  }, [data])

  const filteredContainers = useMemo(() => {
    const needle = search
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
    return { running }
  }, [containers])

  const { imagesInUse, networkUsage, filteredImages, filteredNetworks, filteredMounts, filteredTemplates } = useDockerLists({
    containers,
    search,
    images: imagesData?.items,
    networks: networksData?.items,
    mounts: volumesData?.items,
    templates: templatesData?.items,
  })

  // A tab opened after a while shows fresh data at once instead of waiting for the next poll
  useEffect(() => {
    if (!pollingActive) return
    if (activeTab === 'images') void refetchImages()
    else if (activeTab === 'networks') void refetchNetworks()
    else if (activeTab === 'volumes') void refetchVolumes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Opens the deploy form with an image from the list already filled in
  const deployFromImage = (image: string) => {
    resetDeployModal()
    setDeployType('image')
    setImgInputValue(image)
    setDeployForm((f) => ({ ...f, image }))
    setShowDeploy(true)
  }

  const refreshAll = () => {
    void refetch()
    void refetchNetworks()
    void refetchImages()
    void refetchVolumes()
    void refetchTemplates()
  }

  const deployReady =
    deployType === 'image'
      ? Boolean(deployForm.name.trim() && deployForm.image.trim())
      : Boolean(deployForm.name.trim() && deployForm.composeYaml.trim())

  return {
    t,
    activeTab,
    setActiveTab,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    networksData,
    refetchNetworks,
    imagesData,
    refetchImages,
    volumesData,
    refetchVolumes,
    volumesQuery,
    networksQuery,
    imagesQuery,
    templatesQuery,
    templatesData,
    refetchTemplates,
    query,
    setQuery,
    search,
    imagesInUse,
    networkUsage,
    filteredImages,
    filteredNetworks,
    filteredMounts,
    filteredTemplates,
    refreshAll,
    deployFromImage,
    showCreateNet,
    setShowCreateNet,
    netForm,
    setNetForm,
    showCreateTpl,
    setShowCreateTpl,
    tplForm,
    setTplForm,
    showDeploy,
    setShowDeploy,
    showPullImage,
    setShowPullImage,
    showSaveAsTpl,
    setShowSaveAsTpl,
    saveTemplateName,
    setSaveTemplateName,
    imgDropdownOpen,
    setImgDropdownOpen,
    imgInputValue,
    setImgInputValue,
    nameDropdownOpen,
    setNameDropdownOpen,
    netDropdownOpen,
    setNetDropdownOpen,
    netInputValue,
    setNetInputValue,
    pullImageForm,
    setPullImageForm,
    imgComboRef,
    nameComboRef,
    netComboRef,
    deleteConfirm,
    setDeleteConfirm,
    logModal,
    setLogModal,
    deleteOpts,
    setDeleteOpts,
    editContainer,
    setEditContainer,
    editLoading,
    setEditLoading,
    domainContainer,
    setDomainContainer,
    deployType,
    setDeployType,
    deployForm,
    setDeployForm,
    resetDeployModal,
    openDeployModal,
    resetPullImageModal,
    startMutation,
    stopMutation,
    restartMutation,
    deleteMutation,
    deployImageMut,
    deployComposeMut,
    createNetworkMut,
    deleteNetworkMut,
    pullImageMut,
    deleteImageMut,
    deleteTemplateMut,
    createTemplateMut,
    containers,
    filteredContainers,
    stats,
    deployReady,
    tabDropdownOpen,
    setTabDropdownOpen,
    tabDropdownRef,
  }
}

export type DockerWindowState = ReturnType<typeof useDockerWindow>
