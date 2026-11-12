import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Globe, HardDrive, Layers, Plus, Trash2 } from 'lucide-react'
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
import { useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

type InstallMode = 'existing-container' | 'custom-url'

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
  'activity', 'folder', 'wrench', 'workflow', 'shield', 'bar-chart',
  'file-text', 'pen-tool', 'git-branch', 'notebook', 'globe', 'box',
  'server', 'database', 'terminal',
]

const ICON_COLOR_OPTIONS = [
  'blue', 'emerald', 'amber', 'cyan', 'sky', 'teal',
  'violet', 'indigo', 'rose', 'orange', 'slate',
]

export function InstallAppModal({
  open,
  onClose,
  catalogApp,
  editingApp,
  onSuccessApp,
}: InstallAppModalProps) {
  const { t, language } = useI18n()
  const userRole = useAuthStore((s) => s.user?.role || '')
  const isSuperadmin = userRole.toLowerCase() === 'superadmin'
  const { installMutation, updateMutation } = useAppCatalogMutations()

  const [mode, setMode] = useState<InstallMode>('existing-container')
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [hostPort, setHostPort] = useState('')
  const [openPath, setOpenPath] = useState('/')
  const [targetUrl, setTargetUrl] = useState('')
  const [useProxy, setUseProxy] = useState(true)
  const [containerId, setContainerId] = useState('')
  const [iconKey, setIconKey] = useState('globe')
  const [iconColor, setIconColor] = useState('blue')
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
      setName(editingApp.name)
      setTagline(editingApp.tagline || '')
      setHostPort(editingApp.hostPort ? String(editingApp.hostPort) : '')
      setOpenPath(editingApp.openPath || '/')
      setTargetUrl(editingApp.targetUrl || '')
      setUseProxy(editingApp.useProxy)
      setIconKey(editingApp.iconKey || 'globe')
      setIconColor(editingApp.iconColor || 'blue')
      setEnvValues({})
      setCustomEnvs([])
      return
    }
    if (catalogApp) {
      setName(catalogApp.name)
      setTagline(language === 'id' ? catalogApp.taglineId : catalogApp.taglineEn)
      setHostPort(String(catalogApp.defaultHostPort || ''))
      setOpenPath(catalogApp.openPath || '/')
      setTargetUrl('')
      setUseProxy(true)
      setContainerId('')
      setIconKey(catalogApp.iconKey || 'box')
      setIconColor(catalogApp.iconColor || 'blue')
      const nextEnv: Record<string, string> = {}
      for (const spec of catalogApp.env || []) {
        nextEnv[spec.key] = spec.defaultValue || ''
      }
      setEnvValues(nextEnv)
      setCustomEnvs([])
      return
    }
    setMode('existing-container')
    setName('')
    setTagline('')
    setHostPort('')
    setOpenPath('/')
    setTargetUrl('')
    setUseProxy(true)
    setContainerId('')
    setIconKey('box')
    setIconColor('sky')
    setEnvValues({})
    setCustomEnvs([])
  }, [open, editingApp, catalogApp, language])

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

  const modeTabs: TabItem<InstallMode>[] = [
    { key: 'existing-container', label: t('appCatalog.modeExistingContainer'), icon: <Box className="h-3.5 w-3.5" /> },
    { key: 'custom-url', label: t('appCatalog.modeCustomUrl'), icon: <Globe className="h-3.5 w-3.5" /> },
  ]

  const isBusy = installMutation.isPending || updateMutation.isPending
  const isCustomUrlMode = editingApp ? editingApp.kind === 'custom-url' : !catalogApp && mode === 'custom-url'
  const showPortControls = !isCustomUrlMode

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (editingApp) {
      const patch: UpdateInstalledAppPayload = {
        name: name.trim(),
        tagline: tagline.trim(),
        iconKey,
        iconColor,
        openPath: openPath.trim() || '/',
        useProxy,
        ...(editingApp.kind === 'custom-url' ? { targetUrl: targetUrl.trim() } : {}),
      }
      try {
        const updated = await updateMutation.mutateAsync({ id: editingApp.id, payload: patch })
        toast.success(t('appCatalog.updateSuccess'))
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

    const parsedPort = hostPort.trim() ? Number(hostPort.trim()) : undefined
    const payload: InstallCatalogAppPayload = catalogApp
      ? {
          mode: 'catalog',
          catalogId: catalogApp.id,
          name: name.trim() || catalogApp.name,
          tagline: tagline.trim(),
          iconKey,
          iconColor,
          hostPort: parsedPort,
          openPath: openPath.trim() || catalogApp.openPath || '/',
          useProxy,
          env: mergedEnv,
        }
      : mode === 'existing-container'
        ? {
            mode: 'existing-container',
            containerId,
            name: name.trim(),
            tagline: tagline.trim(),
            hostPort: parsedPort,
            openPath: openPath.trim() || '/',
            iconKey,
            iconColor,
            useProxy: true,
          }
        : {
            mode: 'custom-url',
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

  const subtitle = catalogApp
    ? `${catalogApp.image} — ${language === 'id' ? catalogApp.descriptionId : catalogApp.descriptionEn}`
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
              onChange={(e) => setName(e.target.value)}
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
            <Field label={t('appCatalog.openPathLabel')}>
              <TextInput
                mono
                value={openPath}
                onChange={(e) => setOpenPath(e.target.value)}
                placeholder="/"
              />
            </Field>
          </div>
        ) : null}

        {catalogApp && (catalogApp.volumes?.length || 0) > 0 && !editingApp ? (
          <div className="space-y-1.5">
            <div className="panel-section-label flex items-center gap-1.5">
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
              <div className="panel-section-label flex items-center gap-1.5 mb-0">
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

            {(catalogApp.env?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {catalogApp.env.map((spec) => (
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
