import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpCircle, Box, Globe, HardDrive, Layers, Plus, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  CatalogApp,
  InstallCatalogAppPayload,
  InstalledApp,
  UpdateInstalledAppPayload,
} from '@/api/appCatalog'
import { listContainers } from '@/api/docker'
import { InstalledAppBadge } from '@/components/common/AppIcon'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Select } from '@/components/ui/Select'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

type InstallMode = 'existing-container' | 'custom-url'

const CUSTOM_VERSION_SENTINEL = '__custom__'

function splitImageRepoTag(image: string): { repo: string; tag: string } {
  const trimmed = image.trim()
  const lastSlash = trimmed.lastIndexOf('/')
  const lastColon = trimmed.lastIndexOf(':')
  if (lastColon > lastSlash) {
    return { repo: trimmed.slice(0, lastColon), tag: trimmed.slice(lastColon + 1) }
  }
  return { repo: trimmed, tag: 'latest' }
}

interface CustomEnvEntry {
  key: string
  value: string
}

interface InstallAppModalProps {
  open: boolean
  onClose: () => void
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  onSuccessApp?: (app: InstalledApp, isNew: boolean) => void
}

const ICON_KEY_OPTIONS = [
  'uptime-kuma', 'filebrowser', 'it-tools', 'n8n', 'vaultwarden', 'grafana',
  'stirling-pdf', 'excalidraw', 'gitea', 'memos', 'reneo-crm',
  'adguard-home', 'jellyfin', 'nextcloud', 'nginx-proxy-manager', 'open-webui',
  'beszel', 'actual-budget', 'vikunja', 'metube', 'pairdrop',
  'activity', 'folder', 'wrench', 'workflow', 'shield', 'bar-chart',
  'file-text', 'pen-tool', 'git-branch', 'notebook', 'globe', 'box',
  'server', 'database', 'terminal',
]

const ICON_COLOR_OPTIONS = [
  'blue', 'emerald', 'amber', 'cyan', 'sky', 'teal',
  'violet', 'indigo', 'rose', 'orange', 'slate',
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseAppAccessPath(raw: string, defaultSlug: string): { slug: string; subpath: string } {
  let cleaned = raw.trim()
  if (!cleaned || cleaned === '/') return { slug: defaultSlug, subpath: '/' }
  if (!cleaned.startsWith('/')) cleaned = '/' + cleaned
  if (cleaned.startsWith('/app/')) {
    const rest = cleaned.slice(5)
    const slashIdx = rest.indexOf('/')
    if (slashIdx === -1) {
      return { slug: slugify(rest) || defaultSlug, subpath: '/' }
    }
    const slugPart = slugify(rest.slice(0, slashIdx)) || defaultSlug
    let subPart = rest.slice(slashIdx) || '/'
    while (subPart.startsWith('/app/')) {
      subPart = subPart.slice(4)
    }
    if (subPart.startsWith(`/${slugPart}/`)) {
      subPart = subPart.slice(slugPart.length + 1)
    } else if (subPart === `/${slugPart}`) {
      subPart = '/'
    }
    return {
      slug: slugPart,
      subpath: subPart || '/',
    }
  }
  const trimmed = cleaned.replace(/^\/+/, '')
  const slashIdx = trimmed.indexOf('/')
  if (slashIdx === -1) {
    return { slug: slugify(trimmed) || defaultSlug, subpath: '/' }
  }
  const slugPart = slugify(trimmed.slice(0, slashIdx)) || defaultSlug
  const subPart = trimmed.slice(slashIdx) || '/'
  return {
    slug: slugPart,
    subpath: subPart || '/',
  }
}

export function InstallAppModal({
  open,
  onClose,
  catalogApp,
  editingApp,
  onSuccessApp,
}: InstallAppModalProps) {
  const { t, language } = useI18n()
  const currentUser = useAuthStore((s) => s.user)
  const userRole = currentUser?.role || ''
  const currentUsername = currentUser?.username || ''
  const isSuperadmin = userRole.toLowerCase() === 'superadmin'
  const isReneoCrm = catalogApp?.id === 'reneo-crm'
  const { data: catalogData } = useAppCatalog(open && Boolean(editingApp?.catalogId))
  const { installMutation, updateMutation, upgradeMutation } = useAppCatalogMutations()

  const [mode, setMode] = useState<InstallMode>('existing-container')
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [hostPort, setHostPort] = useState('')
  const [openPath, setOpenPath] = useState('/app/my-app')
  const [isPathCustomized, setIsPathCustomized] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [useProxy, setUseProxy] = useState(true)
  const [containerId, setContainerId] = useState('')
  const [iconKey, setIconKey] = useState('globe')
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
      const currentSlug = editingApp.slug || String(editingApp.id)
      let currentSub = editingApp.openPath && editingApp.openPath !== '/' ? editingApp.openPath : ''
      while (currentSub.startsWith('/app/')) {
        currentSub = currentSub.slice(4)
      }
      if (currentSub.startsWith(`/${currentSlug}/`)) {
        currentSub = currentSub.slice(currentSlug.length + 1)
      } else if (currentSub === `/${currentSlug}`) {
        currentSub = ''
      }
      setName(editingApp.name)
      setTagline(editingApp.tagline || '')
      setHostPort(editingApp.hostPort ? String(editingApp.hostPort) : '')
      setOpenPath(`/app/${currentSlug}${currentSub}`)
      setIsPathCustomized(true)
      setTargetUrl(editingApp.targetUrl || '')
      setUseProxy(editingApp.useProxy)
      setIconKey(editingApp.iconKey || 'globe')
      setIconColor(editingApp.iconColor || 'blue')
      setSelectedVersion(editParsed?.tag || '')
      setCustomVersion('')
      setEnvValues({})
      setCustomEnvs([])
      return
    }
    if (catalogApp) {
      const { tag: defaultTag } = splitImageRepoTag(catalogApp.image)
      const initialVersion = catalogApp.versions?.[0] || defaultTag
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
      setIconColor(catalogApp.iconColor || 'blue')
      setSelectedVersion(initialVersion)
      setCustomVersion('')
      const nextEnv: Record<string, string> = {}
      for (const spec of catalogApp.env || []) {
        nextEnv[spec.key] = spec.defaultValue || ''
      }
      if (catalogApp.id === 'reneo-crm') {
        if (currentUsername) {
          nextEnv['WAHA_SESSION'] = currentUsername
        }
        nextEnv['WAHA_BASE_URL'] = nextEnv['WAHA_BASE_URL'] || 'http://reneo-waha:3000'
      }
      setEnvValues(nextEnv)
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
    setIconColor('sky')
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

  const iconKeySelectOptions = useMemo(() => ICON_KEY_OPTIONS.map((k) => ({ value: k, label: k })), [])
  const iconColorSelectOptions = useMemo(() => ICON_COLOR_OPTIONS.map((c) => ({ value: c, label: c })), [])

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

  const { imageRepo, defaultTag, versionOptions, effectiveVersion, resolvedImage } = useMemo(() => {
    const sourceImage = catalogApp
      ? catalogApp.image
      : editingApp && editingApp.kind !== 'custom-url'
        ? editingApp.image
        : ''
    if (!sourceImage) {
      return {
        imageRepo: '',
        defaultTag: '',
        versionOptions: [] as { value: string; label: string }[],
        effectiveVersion: '',
        resolvedImage: '',
      }
    }
    const parsed = splitImageRepoTag(sourceImage)
    const presetSource = catalogApp?.versions ?? editingCatalogApp?.versions ?? []
    const rawList = presetSource.length ? presetSource : [parsed.tag]
    const unique = rawList.includes(parsed.tag) ? rawList : [parsed.tag, ...rawList]
    const options = [
      ...unique.map((v) => ({
        value: v,
        label: v === parsed.tag ? `${v} ${t('appCatalog.versionDefaultSuffix')}` : v,
      })),
      { value: CUSTOM_VERSION_SENTINEL, label: t('appCatalog.versionCustomOption') },
    ]
    const chosen =
      selectedVersion === CUSTOM_VERSION_SENTINEL
        ? customVersion.trim() || parsed.tag
        : selectedVersion || parsed.tag
    return {
      imageRepo: parsed.repo,
      defaultTag: parsed.tag,
      versionOptions: options,
      effectiveVersion: chosen,
      resolvedImage: `${parsed.repo}:${chosen}`,
    }
  }, [catalogApp, editingApp, editingCatalogApp, selectedVersion, customVersion, t])

  const modeTabs: TabItem<InstallMode>[] = [
    { key: 'existing-container', label: t('appCatalog.modeExistingContainer'), icon: <Box className="h-3.5 w-3.5" /> },
    { key: 'custom-url', label: t('appCatalog.modeCustomUrl'), icon: <Globe className="h-3.5 w-3.5" /> },
  ]

  const isBusy = installMutation.isPending || updateMutation.isPending || upgradeMutation.isPending
  const isCustomUrlMode = editingApp ? editingApp.kind === 'custom-url' : !catalogApp && mode === 'custom-url'
  const showPortControls = !isCustomUrlMode
  const showEditDockerVersion = Boolean(editingApp && editingApp.kind !== 'custom-url' && editingApp.image)
  const versionChangedInEdit = showEditDockerVersion && Boolean(effectiveVersion && effectiveVersion !== defaultTag)

  const handleDirectUpgrade = async () => {
    if (!editingApp) return
    try {
      const updated = await upgradeMutation.mutateAsync({
        id: editingApp.id,
        version: versionChangedInEdit ? effectiveVersion : undefined,
      })
      toast.success(t('appCatalog.upgradeSuccess', { image: updated.image }))
      onSuccessApp?.(updated, false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (editingApp) {
      const defaultSlug = editingApp.slug || slugify(name) || 'app'
      const { slug: parsedSlug, subpath } = parseAppAccessPath(openPath, defaultSlug)
      const patch: UpdateInstalledAppPayload = {
        name: name.trim(),
        slug: parsedSlug,
        tagline: tagline.trim(),
        iconKey,
        iconColor,
        openPath: subpath,
        useProxy,
        ...(editingApp.kind === 'custom-url' ? { targetUrl: targetUrl.trim() } : {}),
      }
      try {
        let updated = await updateMutation.mutateAsync({ id: editingApp.id, payload: patch })
        if (versionChangedInEdit) {
          updated = await upgradeMutation.mutateAsync({
            id: editingApp.id,
            version: effectiveVersion,
          })
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

    const mergedEnv: Record<string, string> = { ...envValues }
    for (const row of customEnvs) {
      const k = row.key.trim()
      if (k) mergedEnv[k] = row.value
    }
    if (isReneoCrm) {
      if (!mergedEnv['WAHA_SESSION'] || mergedEnv['WAHA_SESSION'] === 'default') {
        if (currentUsername) mergedEnv['WAHA_SESSION'] = currentUsername
      }
      if (!mergedEnv['WAHA_BASE_URL']) {
        mergedEnv['WAHA_BASE_URL'] = 'http://reneo-waha:3000'
      }
    }

    const defaultSlug = catalogApp?.id || slugify(name) || 'app'
    const { slug: parsedSlug, subpath } = parseAppAccessPath(openPath, defaultSlug)
    const parsedPort = hostPort.trim() ? Number(hostPort.trim()) : undefined
    const payload: InstallCatalogAppPayload = catalogApp
      ? {
          mode: 'catalog',
          catalogId: catalogApp.id,
          version: effectiveVersion !== defaultTag ? effectiveVersion : undefined,
          slug: parsedSlug,
          name: name.trim() || catalogApp.name,
          tagline: tagline.trim(),
          iconKey,
          iconColor,
          hostPort: parsedPort,
          openPath: subpath,
          useProxy,
          env: mergedEnv,
        }
      : mode === 'existing-container'
        ? {
            mode: 'existing-container',
            containerId,
            slug: parsedSlug,
            name: name.trim(),
            tagline: tagline.trim(),
            hostPort: parsedPort,
            openPath: subpath,
            iconKey,
            iconColor,
            useProxy: true,
          }
        : {
            mode: 'custom-url',
            slug: parsedSlug,
            name: name.trim(),
            tagline: tagline.trim(),
            targetUrl: targetUrl.trim(),
            iconKey,
            iconColor,
            useProxy,
          }

    try {
      const created = await installMutation.mutateAsync(payload)
      toast.success(t('appCatalog.installSuccess'))
      onSuccessApp?.(created, true)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.installFailed'))
    }
  }

  const title = editingApp
    ? t('appCatalog.editModalTitle')
    : catalogApp
      ? `${t('appCatalog.installTitlePrefix')} ${catalogApp.name}`
      : t('appCatalog.customModalTitle')

  const subtitle = editingApp
    ? editingApp.image || editingApp.targetUrl
    : catalogApp
      ? `${resolvedImage} — ${language === 'id' ? catalogApp.descriptionId : catalogApp.descriptionEn}`
      : undefined

  const notes = catalogApp ? (language === 'id' ? catalogApp.notesId : catalogApp.notesEn) : ''
  const targetPortHint = catalogApp
    ? t('appCatalog.containerPortHint', { port: String(catalogApp.containerPort) })
    : selectedContainer && !selectedContainer.Ports?.some((p) => p.PublicPort)
      ? t('appCatalog.containerNoPublishedPort')
      : undefined

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={<InstalledAppBadge iconKey={iconKey} iconColor={iconColor} size="lg" />}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isBusy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="app-catalog-install-form" variant="primary" loading={isBusy}>
            {editingApp ? t('common.save') : t('appCatalog.installAction')}
          </Button>
        </>
      }
    >
      <form id="app-catalog-install-form" onSubmit={handleSubmit} className="space-y-4">
        {!editingApp && !catalogApp ? (
          <Tabs
            items={modeTabs}
            value={mode}
            onChange={(next) => {
              setMode(next)
              if (next === 'custom-url' && iconKey === 'box') setIconKey('globe')
              if (next === 'existing-container' && iconKey === 'globe') setIconKey('box')
            }}
            label={t('appCatalog.installModeLabel')}
          />
        ) : null}

        {!editingApp && !catalogApp && mode === 'existing-container' ? (
          <Field label={t('appCatalog.selectContainerLabel')}>
            <Select
              value={containerId}
              onChange={handlePickContainer}
              options={containerOptions}
              searchable
              placeholder={t('appCatalog.selectContainerPlaceholder')}
              emptyText={t('appCatalog.noContainerOption')}
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('appCatalog.nameLabel')}>
            <TextInput
              value={name}
              onChange={(e) => {
                const val = e.target.value
                setName(val)
                if (!isPathCustomized && !catalogApp && !editingApp) {
                  const s = slugify(val)
                  setOpenPath(s ? `/app/${s}` : '/app/my-app')
                }
              }}
              placeholder={t('appCatalog.namePlaceholder')}
              required
            />
          </Field>
          <Field label={t('appCatalog.taglineLabel')}>
            <TextInput
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t('appCatalog.taglinePlaceholder')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('appCatalog.iconLabel')}>
            <Select value={iconKey} onChange={setIconKey} options={iconKeySelectOptions} searchable />
          </Field>
          <Field label={t('appCatalog.colorLabel')}>
            <Select value={iconColor} onChange={setIconColor} options={iconColorSelectOptions} />
          </Field>
        </div>

        {catalogApp && !editingApp ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label={t('appCatalog.versionLabel')}
              hint={t('appCatalog.versionImageHint', { image: `${imageRepo}:${effectiveVersion}` })}
            >
              <Select
                value={selectedVersion || defaultTag}
                onChange={setSelectedVersion}
                options={versionOptions}
              />
            </Field>
            {selectedVersion === CUSTOM_VERSION_SENTINEL ? (
              <Field label={t('appCatalog.versionCustomOption')}>
                <TextInput
                  mono
                  value={customVersion}
                  onChange={(e) => setCustomVersion(e.target.value)}
                  placeholder={t('appCatalog.versionCustomPlaceholder')}
                  required
                />
              </Field>
            ) : null}
          </div>
        ) : showEditDockerVersion ? (
          <div className="app-catalog-volume-list space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="panel-mono text-[11.5px] text-[var(--win-text)] truncate">
                {t('appCatalog.versionCurrentLabel', { image: editingApp?.image || '' })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="primary-soft"
                icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
                loading={upgradeMutation.isPending}
                disabled={isBusy}
                onClick={handleDirectUpgrade}
              >
                {versionChangedInEdit ? t('appCatalog.upgradeApplyVersion') : t('appCatalog.upgradeButton')}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label={t('appCatalog.versionLabel')}
                hint={t('appCatalog.versionImageHint', { image: resolvedImage })}
              >
                <Select
                  value={selectedVersion || defaultTag}
                  onChange={setSelectedVersion}
                  options={versionOptions}
                />
              </Field>
              {selectedVersion === CUSTOM_VERSION_SENTINEL ? (
                <Field label={t('appCatalog.versionCustomOption')}>
                  <TextInput
                    mono
                    value={customVersion}
                    onChange={(e) => setCustomVersion(e.target.value)}
                    placeholder={t('appCatalog.versionCustomPlaceholder')}
                    required
                  />
                </Field>
              ) : null}
            </div>
            <p className="text-[11.5px] text-[var(--text-secondary)] m-0">
              {t('appCatalog.versionKeepDataHint')}
            </p>
          </div>
        ) : null}

        {isCustomUrlMode ? (
          <Field label={t('appCatalog.targetUrlLabel')}>
            <TextInput
              mono
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://app.example.com"
              required
            />
          </Field>
        ) : showPortControls ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('appCatalog.portLabel')} hint={targetPortHint}>
              <TextInput
                mono
                type="number"
                min={1}
                max={65535}
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value)}
                placeholder="18001"
                disabled={Boolean(editingApp)}
              />
            </Field>
            <Field label={t('appCatalog.openPathLabel')} hint={t('appCatalog.openPathHint')}>
              <TextInput
                mono
                value={openPath}
                onChange={(e) => {
                  setOpenPath(e.target.value)
                  setIsPathCustomized(true)
                }}
                placeholder="/app/my-app"
              />
            </Field>
          </div>
        ) : null}

        {catalogApp && (catalogApp.volumes?.length || 0) > 0 && !editingApp ? (
          <div className="space-y-1.5">
            <div className="app-catalog-section-title">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{t('appCatalog.volumesSectionTitle')}</span>
            </div>
            <div className="app-catalog-volume-list">
              {catalogApp.volumes.map((v) => (
                <div key={v.containerPath} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-[var(--text-secondary)] truncate">{v.label}</span>
                  <span className="panel-mono text-[11px] text-[var(--win-text)] shrink-0">
                    ~/docker/.../{v.hostSubdir} → {v.containerPath}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {catalogApp && !editingApp ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="app-catalog-section-title mb-0">
                <Layers className="h-3.5 w-3.5" />
                <span>{t('appCatalog.envSectionTitle')}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setCustomEnvs((prev) => [...prev, { key: '', value: '' }])}
              >
                {t('appCatalog.addEnvButton')}
              </Button>
            </div>

            {isReneoCrm ? (
              <div className="rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] p-3 space-y-2">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--win-text)]">
                  <Smartphone className="h-4 w-4 text-[var(--panel-primary-text)]" />
                  <span>{t('appCatalog.wahaAutoTitle')}</span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed m-0">
                  {t('appCatalog.wahaAutoDesc', { username: currentUsername ? `@${currentUsername}` : '@user' })}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5 text-[11px] text-[var(--text-muted)] border-t border-[var(--card-border)]">
                  <span>
                    {t('appCatalog.wahaSessionLabel')}: <span className="panel-mono text-[var(--win-text)] font-medium">{currentUsername || 'default'}</span>
                  </span>
                  <span>
                    {t('appCatalog.wahaRuntimeLabel')}: <span className="panel-mono text-[var(--win-text)] font-medium">reneo-waha:3000</span>
                  </span>
                </div>
              </div>
            ) : null}

            {visibleEnvSpecs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleEnvSpecs.map((spec) => (
                  <Field key={spec.key} label={language === 'id' ? spec.labelId : spec.labelEn}>
                    {spec.secret ? (
                      <PasswordInput
                        mono
                        value={envValues[spec.key] ?? ''}
                        onChange={(e) => setEnvValues((p) => ({ ...p, [spec.key]: e.target.value }))}
                        placeholder={spec.placeholder || spec.defaultValue}
                        required={spec.required}
                      />
                    ) : (
                      <TextInput
                        mono
                        value={envValues[spec.key] ?? ''}
                        onChange={(e) => setEnvValues((p) => ({ ...p, [spec.key]: e.target.value }))}
                        placeholder={spec.placeholder || spec.defaultValue}
                        required={spec.required}
                      />
                    )}
                  </Field>
                ))}
              </div>
            ) : null}

            {customEnvs.map((entry, idx) => (
              <div key={idx} className="docker-env-row">
                <TextInput
                  mono
                  value={entry.key}
                  onChange={(e) =>
                    setCustomEnvs((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item)),
                    )
                  }
                  placeholder={t('appCatalog.envKeyPlaceholder')}
                  aria-label={t('appCatalog.envKeyPlaceholder')}
                />
                <TextInput
                  mono
                  value={entry.value}
                  onChange={(e) =>
                    setCustomEnvs((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item)),
                    )
                  }
                  placeholder={t('appCatalog.envValuePlaceholder')}
                  aria-label={t('appCatalog.envValuePlaceholder')}
                />
                <IconButton
                  label={t('common.delete')}
                  tone="danger"
                  onClick={() => setCustomEnvs((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        ) : null}

        {(isCustomUrlMode || catalogApp) && !editingApp ? (
          <Checkbox
            checked={useProxy}
            onChange={setUseProxy}
            label={t('appCatalog.useProxyLabel')}
            description={
              isCustomUrlMode
                ? isSuperadmin
                  ? t('appCatalog.useProxyDescSuperadmin')
                  : t('appCatalog.useProxyDescUser')
                : t('appCatalog.useProxyDescCatalog')
            }
          />
        ) : editingApp?.kind === 'custom-url' ? (
          <Checkbox
            checked={useProxy}
            onChange={setUseProxy}
            label={t('appCatalog.useProxyLabel')}
            description={
              isSuperadmin ? t('appCatalog.useProxyDescSuperadmin') : t('appCatalog.useProxyDescUser')
            }
          />
        ) : null}

        {notes ? (
          <p className="text-[12px] text-[var(--panel-info-text)] bg-[var(--panel-info-bg)] px-3 py-2 rounded-md">
            {notes}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
