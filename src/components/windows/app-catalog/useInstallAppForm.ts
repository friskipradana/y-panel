import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { listContainers } from '@/api/docker'
import {
  buildInitialCatalogEnv,
  buildVersionSelectionState,
  normalizeEditingOpenPath,
  slugify,
  splitImageRepoTag,
  type CustomEnvEntry,
  type IconSourceMode,
  type InstallMode,
} from '@/components/windows/app-catalog/installFormHelpers'
import {
  buildEditPatchPayload,
  buildInstallPayload,
  mergeInstallEnv,
  submitInstallWithPortRetry,
} from '@/components/windows/app-catalog/installSubmitHelpers'
import { pickPreferredCatalogVersion } from '@/components/windows/app-catalog/versionHelpers'
import { useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

interface UseInstallAppFormParams {
  open: boolean
  onClose: () => void
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  onSuccessApp?: (app: InstalledApp, isNew: boolean) => void
}

export function useInstallAppForm({
  open,
  onClose,
  catalogApp,
  editingApp,
  onSuccessApp,
}: UseInstallAppFormParams) {
  const { t, language } = useI18n()
  const currentUser = useAuthStore((s) => s.user)
  const userRole = currentUser?.role || ''
  const currentUsername = currentUser?.username || ''
  const isSuperadmin = userRole.toLowerCase() === 'superadmin'
  const isReneoCrm = catalogApp?.id === 'reneo-crm'
  const isCatalogApp = Boolean(catalogApp || editingApp?.catalogId)
  const { data: catalogData } = useAppCatalog(open && Boolean(editingApp?.catalogId))
  const { installMutation, createCatalogMutation, updateMutation, upgradeMutation } = useAppCatalogMutations()

  const [mode, setMode] = useState<InstallMode>('existing-container')
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [catalogImage, setCatalogImage] = useState('')
  const [catalogContainerPort, setCatalogContainerPort] = useState('80')
  const [catalogCategory, setCatalogCategory] = useState('tools')
  const [catalogDescription, setCatalogDescription] = useState('')
  const [hostPort, setHostPort] = useState('')
  const [openPath, setOpenPath] = useState('/app/my-app')
  const [isPathCustomized, setIsPathCustomized] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [useProxy, setUseProxy] = useState(true)
  const [containerId, setContainerId] = useState('')
  const [iconKey, setIconKey] = useState('globe')
  const [iconSourceMode, setIconSourceMode] = useState<IconSourceMode>('preset')
  const [iconColor, setIconColor] = useState('blue')
  const [selectedVersion, setSelectedVersion] = useState('')
  const [customVersion, setCustomVersion] = useState('')
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [customEnvs, setCustomEnvs] = useState<CustomEnvEntry[]>([])

  const { data: containers = [] } = useQuery({
    queryKey: ['app-catalog-containers'],
    queryFn: listContainers,
    enabled: open && !editingApp && !catalogApp && mode === 'existing-container',
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!open) return
    if (editingApp) {
      const editParsed = editingApp.image ? splitImageRepoTag(editingApp.image) : null
      setName(editingApp.name)
      setTagline(editingApp.tagline || '')
      setHostPort(editingApp.hostPort ? String(editingApp.hostPort) : '')
      setOpenPath(normalizeEditingOpenPath(editingApp))
      setIsPathCustomized(true)
      setTargetUrl(editingApp.targetUrl || '')
      setUseProxy(editingApp.useProxy)
      const nextIcon = editingApp.iconKey || 'globe'
      setIconKey(nextIcon)
      setIconSourceMode(/^https?:\/\//i.test(nextIcon) ? 'url' : 'preset')
      setIconColor(editingApp.iconColor || 'blue')
      setSelectedVersion(editParsed?.tag || '')
      setCustomVersion('')
      setEnvValues({})
      setCustomEnvs([])
      return
    }
    if (catalogApp) {
      const { tag: defaultTag } = splitImageRepoTag(catalogApp.image)
      const initialVersion = pickPreferredCatalogVersion(catalogApp.versions, defaultTag)
      const defaultSlug = catalogApp.id || slugify(catalogApp.name) || 'app'
      setName(catalogApp.name)
      setTagline(language === 'id' ? catalogApp.taglineId : catalogApp.taglineEn)
      setHostPort(String(catalogApp.defaultHostPort || ''))
      setOpenPath(`/app/${defaultSlug}`)
      setIsPathCustomized(false)
      setTargetUrl('')
      setUseProxy(true)
      setContainerId('')
      setIconKey(catalogApp.iconKey || 'box')
      setIconSourceMode(/^https?:\/\//i.test(catalogApp.iconKey || '') ? 'url' : 'preset')
      setIconColor(catalogApp.iconColor || 'blue')
      setSelectedVersion(initialVersion)
      setCustomVersion('')
      setEnvValues(buildInitialCatalogEnv(catalogApp, currentUsername))
      setCustomEnvs([])
      return
    }
    setMode('existing-container')
    setName('')
    setTagline('')
    setHostPort('')
    setOpenPath('/app/my-app')
    setIsPathCustomized(false)
    setTargetUrl('')
    setUseProxy(true)
    setContainerId('')
    setIconKey('box')
    setIconSourceMode('preset')
    setIconColor('sky')
    setCatalogImage('')
    setCatalogContainerPort('80')
    setCatalogCategory('tools')
    setCatalogDescription('')
    setEnvValues({})
    setCustomEnvs([])
  }, [open, editingApp, catalogApp, language, currentUsername])

  const containerOptions = useMemo(
    () =>
      containers.map((c) => {
        const cleanName = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, '')
        const publicPort = c.Ports?.find((p) => p.PublicPort)?.PublicPort
        return {
          value: c.Id,
          label: cleanName,
          description: publicPort ? `${c.Image} (${publicPort})` : c.Image,
          dotTone: c.State === 'running' ? ('success' as const) : ('neutral' as const),
        }
      }),
    [containers],
  )

  const selectedContainer = useMemo(
    () => containers.find((c) => c.Id === containerId),
    [containers, containerId],
  )

  const handlePickContainer = (pickedId: string) => {
    setContainerId(pickedId)
    const found = containers.find((c) => c.Id === pickedId)
    if (!found) return
    const cleanName = (found.Names?.[0] || '').replace(/^\//, '')
    if (!name.trim() && cleanName) setName(cleanName)
    const pub = found.Ports?.find((p) => p.PublicPort)?.PublicPort
    if (pub) setHostPort(String(pub))
  }

  const editingCatalogApp = useMemo(
    () => (editingApp?.catalogId ? catalogData?.catalog.find((c) => c.id === editingApp.catalogId) : undefined),
    [catalogData?.catalog, editingApp?.catalogId],
  )

  const visibleEnvSpecs = useMemo(() => {
    if (!catalogApp?.env) return []
    return catalogApp.env.filter((spec) => {
      if (spec.hidden) return false
      if (isReneoCrm && (spec.key === 'WAHA_BASE_URL' || spec.key === 'WAHA_SESSION' || spec.key === 'WAHA_API_KEY')) {
        return false
      }
      return true
    })
  }, [catalogApp?.env, isReneoCrm])

  const versionState = useMemo(
    () =>
      buildVersionSelectionState({
        catalogApp,
        editingApp,
        editingCatalogApp,
        selectedVersion,
        customVersion,
        t,
      }),
    [catalogApp, editingApp, editingCatalogApp, selectedVersion, customVersion, t],
  )

  const isBusy =
    installMutation.isPending ||
    createCatalogMutation.isPending ||
    updateMutation.isPending ||
    upgradeMutation.isPending
  const isCustomCatalogMode = !editingApp && !catalogApp && mode === 'custom-catalog'
  const isCustomUrlMode = editingApp ? editingApp.kind === 'custom-url' : !catalogApp && mode === 'custom-url'
  const showPortControls = !isCustomUrlMode
  const showEditDockerVersion = Boolean(editingApp && editingApp.kind !== 'custom-url' && editingApp.image)
  const versionChangedInEdit =
    showEditDockerVersion && Boolean(versionState.effectiveVersion && versionState.effectiveVersion !== versionState.defaultTag)

  const handleDirectUpgrade = async () => {
    if (!editingApp) return
    try {
      const updated = await upgradeMutation.mutateAsync({
        id: editingApp.id,
        version: versionChangedInEdit ? versionState.effectiveVersion : undefined,
      })
      toast.success(t('appCatalog.upgradeSuccess', { image: updated.image }))
      onSuccessApp?.(updated, false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (editingApp) {
      const patch = buildEditPatchPayload({
        editingApp, name, tagline, openPath, iconKey, iconColor, useProxy, targetUrl,
      })
      try {
        let updated = await updateMutation.mutateAsync({ id: editingApp.id, payload: patch })
        if (versionChangedInEdit) {
          updated = await upgradeMutation.mutateAsync({ id: editingApp.id, version: versionState.effectiveVersion })
          toast.success(t('appCatalog.upgradeSuccess', { image: updated.image }))
        } else {
          toast.success(t('appCatalog.updateSuccess'))
        }
        onSuccessApp?.(updated, false)
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
      }
      return
    }

    if (isCustomCatalogMode) {
      const parsedPort = hostPort.trim() ? Number(hostPort.trim()) : undefined
      const parsedContainerPort = Number(catalogContainerPort.trim() || '80')
      try {
        await createCatalogMutation.mutateAsync({
          name: name.trim(),
          tagline: tagline.trim() || name.trim(),
          description: catalogDescription.trim() || tagline.trim() || name.trim(),
          category: catalogCategory,
          iconKey: iconKey.trim() || 'box',
          iconColor,
          image: catalogImage.trim(),
          containerPort: parsedContainerPort,
          defaultHostPort: parsedPort,
          openPath: openPath.trim() || '/',
        })
        toast.success(t('appCatalog.catalogCreateSuccess'))
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('appCatalog.installFailed'))
      }
      return
    }

    const mergedEnv = mergeInstallEnv({ envValues, customEnvs, isReneoCrm, currentUsername })
    const payload = buildInstallPayload({
      catalogApp,
      mode,
      containerId,
      name,
      tagline,
      openPath,
      hostPort,
      targetUrl,
      iconKey,
      iconColor,
      useProxy,
      effectiveVersion: versionState.effectiveVersion,
      defaultTag: versionState.defaultTag,
      mergedEnv,
    })

    await submitInstallWithPortRetry({
      payload,
      installAsync: (targetPayload) => installMutation.mutateAsync(targetPayload),
      onSwitchPort: setHostPort,
      onSuccessApp,
      onClose,
      t,
    })
  }

  return {
    language, isSuperadmin, isCatalogApp, editingCatalogApp,
    mode, setMode, name, setName, tagline, setTagline,
    catalogImage, setCatalogImage, catalogContainerPort, setCatalogContainerPort,
    catalogCategory, setCatalogCategory, catalogDescription, setCatalogDescription,
    hostPort, setHostPort, openPath, setOpenPath, isPathCustomized, setIsPathCustomized,
    targetUrl, setTargetUrl, useProxy, setUseProxy,
    containerId, containerOptions, selectedContainer, handlePickContainer,
    iconKey, setIconKey, iconSourceMode, setIconSourceMode, iconColor, setIconColor,
    selectedVersion, setSelectedVersion, customVersion, setCustomVersion,
    envValues, setEnvValues, customEnvs, setCustomEnvs, visibleEnvSpecs, versionState,
    isBusy, isUpgradePending: upgradeMutation.isPending,
    isCustomCatalogMode, isCustomUrlMode, showPortControls, showEditDockerVersion,
    versionChangedInEdit, handleDirectUpgrade, handleSubmit,
  }
}
