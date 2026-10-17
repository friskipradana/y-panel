import { type WindowState } from '@/types'
import {
  useContainerTable,
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
import { useListQuery } from '@/hooks/useListQuery'
import { DEFAULT_COMPOSE_YAML, createDefaultDeployForm, createDefaultPullImageForm, type DockerTab } from './constants'

export function useDockerWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const pollingActive = useWindowPollingActive(win)
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<DockerTab>('containers')
  // each table keeps its own search, order and column filters; the agent applies them
  const lists = {
    containers: useListQuery(),
    images: useListQuery(),
    networks: useListQuery(),
    volumes: useListQuery(),
    templates: useListQuery(),
  }
  const current = lists[activeTab]
  const narrowed = !!current.query.q || Object.keys(current.filters).length > 0
  const containersQuery = useContainerTable(lists.containers.query, pollingActive)
  const { data, isLoading, isError, error, refetch, isFetching } = containersQuery
  // only the tab on screen is polled
  const networksQuery = useDockerNetworks(pollingActive && activeTab === 'networks', lists.networks.query)
  const imagesQuery = useDockerImages(pollingActive && activeTab === 'images', lists.images.query)
  const volumesQuery = useDockerVolumes(pollingActive && activeTab === 'volumes', lists.volumes.query)
  const templatesQuery = useDockerTemplates(lists.templates.query)
  const { data: networksData, refetch: refetchNetworks } = networksQuery
  const { data: imagesData, refetch: refetchImages } = imagesQuery
  const { data: volumesData, refetch: refetchVolumes } = volumesQuery
  const { data: templatesData, refetch: refetchTemplates } = templatesQuery

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

  const filteredContainers = useMemo(() => data?.items ?? [], [data])
  const filteredImages = useMemo(() => imagesData?.items ?? [], [imagesData])
  const filteredNetworks = useMemo(() => networksData?.items ?? [], [networksData])
  const filteredMounts = useMemo(() => volumesData?.items ?? [], [volumesData])
  const filteredTemplates = useMemo(() => templatesData?.items ?? [], [templatesData])

  // how many there are, whatever the filters say: the tab menu and the badge
  const stats = { running: data?.facets.state?.running ?? 0, all: data?.all ?? 0 }

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
    lists,
    containersQuery,
    current,
    narrowed,
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
    filteredContainers,
    stats,
    deployReady,
  }
}

export type DockerWindowState = ReturnType<typeof useDockerWindow>
