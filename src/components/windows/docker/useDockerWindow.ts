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
  useDockerImages,
  useDockerTemplates,
  useCreateDockerNetwork,
  useDeleteDockerNetwork,
  useDeleteDockerImage,
  usePullDockerImage,
  useDeleteDockerTemplate,
  useCreateDockerTemplate,
} from '@/hooks/useContainers'
import { fetchContainerLogs } from '@/api/agent'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { useI18n } from '@/lib/i18n'
import { DEFAULT_COMPOSE_YAML, createDefaultDeployForm, createDefaultPullImageForm } from './constants'

export function useDockerWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
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
    templatesData,
    refetchTemplates,
    query,
    setQuery,
    setSearch,
    imgSearch,
    setImgSearch,
    imgPage,
    setImgPage,
    IMG_PAGE_SIZE,
    netSearch,
    setNetSearch,
    showCreateNet,
    setShowCreateNet,
    netForm,
    setNetForm,
    tplSearch,
    setTplSearch,
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
    logTail,
    setLogTail,
    logAutoScroll,
    setLogAutoScroll,
    logViewerRef,
    deleteOpts,
    setDeleteOpts,
    editContainer,
    setEditContainer,
    editLoading,
    setEditLoading,
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
    logsQuery,
    containers,
    filteredContainers,
    stats,
    deployReady,
  }
}

export type DockerWindowState = ReturnType<typeof useDockerWindow>
