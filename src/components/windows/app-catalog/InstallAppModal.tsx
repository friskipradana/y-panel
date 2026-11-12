import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Globe, Layers } from 'lucide-react'
import { toast } from 'sonner'
import type {
  CatalogApp,
  InstallCatalogAppPayload,
  InstalledApp,
  UpdateInstalledAppPayload,
} from '@/api/appCatalog'
import { listContainers } from '@/api/docker'
import { InstalledAppGlyph } from '@/components/common/AppIcon'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

type InstallMode = 'catalog' | 'existing-container' | 'custom-url'

interface InstallAppModalProps {
  open: boolean
  onClose: () => void
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  onSuccessApp?: (app: InstalledApp, isNew: boolean) => void
}

const ICON_KEY_OPTIONS = [
  'globe',
  'activity',
  'folder',
  'wrench',
  'workflow',
  'shield',
  'chart',
  'file-text',
  'pen',
  'git-branch',
  'note',
  'box',
  'server',
  'database',
  'terminal',
]

const ICON_COLOR_OPTIONS = [
  'blue',
  'emerald',
  'amber',
  'cyan',
  'violet',
  'rose',
  'orange',
  'slate',
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

  const [mode, setMode] = useState<InstallMode>('custom-url')
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
      return
    }
    if (catalogApp) {
      setMode('catalog')
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
    setIconKey('globe')
    setIconColor('blue')
    setEnvValues({})
  }, [open, editingApp, catalogApp, language])

  const containerOptions = useMemo(() => {
    return containers.map((c) => {
      const cleanName = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, '')
      const publicPort = c.Ports?.find((p) => p.PublicPort)?.PublicPort
      return {
        value: c.Id,
        label: cleanName,
        description: publicPort ? `${c.Image} • :${publicPort}` : c.Image,
        dotTone: c.State === 'running' ? ('success' as const) : ('neutral' as const),
      }
    })
  }, [containers])

  const selectedContainer = useMemo(
    () => containers.find((c) => c.Id === containerId),
    [containers, containerId],
  )

  const handlePickContainer = (pickedId: string) => {
    setContainerId(pickedId)
    const found = containers.find((c) => c.Id === pickedId)
    if (!found) return
    const cleanName = (found.Names?.[0] || '').replace(/^\//, '')
    if (!name.trim() && cleanName) {
      setName(cleanName)
    }
    const pub = found.Ports?.find((p) => p.PublicPort)?.PublicPort
    if (pub) {
      setHostPort(String(pub))
    }
  }

  const iconKeySelectOptions = useMemo(
    () => ICON_KEY_OPTIONS.map((k) => ({ value: k, label: k })),
    [],
  )
  const iconColorSelectOptions = useMemo(
    () => ICON_COLOR_OPTIONS.map((c) => ({ value: c, label: c })),
    [],
  )

  const modeTabs: TabItem<InstallMode>[] = [
    { key: 'existing-container', label: t('appCatalog.modeExistingContainer'), icon: <Box className="h-3.5 w-3.5" /> },
    { key: 'custom-url', label: t('appCatalog.modeCustomUrl'), icon: <Globe className="h-3.5 w-3.5" /> },
  ]

  const isBusy = installMutation.isPending || updateMutation.isPending

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

    const parsedPort = hostPort.trim() ? Number(hostPort.trim()) : undefined
    const payload: InstallCatalogAppPayload =
      catalogApp
        ? {
            mode: 'catalog',
            catalogId: catalogApp.id,
            name: name.trim() || catalogApp.name,
            hostPort: parsedPort,
            openPath: openPath.trim() || catalogApp.openPath || '/',
            env: envValues,
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

  const notes = catalogApp ? (language === 'id' ? catalogApp.notesId : catalogApp.notesEn) : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={
        catalogApp
          ? language === 'id'
            ? catalogApp.descriptionId
            : catalogApp.descriptionEn
          : undefined
      }
      icon={<InstalledAppGlyph iconKey={iconKey} iconColor={iconColor} size={32} />}
      size="md"
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
      <form id="app-catalog-install-form" onSubmit={handleSubmit} className="space-y-3">
        {!editingApp && !catalogApp ? (
          <Tabs
            items={modeTabs}
            value={mode}
            onChange={setMode}
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

          {editingApp?.kind === 'custom-url' || (!catalogApp && !editingApp && mode === 'custom-url') ? (
            <Field label={t('appCatalog.targetUrlLabel')}>
              <TextInput
                mono
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://app.example.com"
                required
              />
            </Field>
          ) : (
            <Field
              label={t('appCatalog.portLabel')}
              hint={
                selectedContainer && !selectedContainer.Ports?.some((p) => p.PublicPort)
                  ? t('appCatalog.containerNoPublishedPort')
                  : undefined
              }
            >
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
          )}
        </div>

        <Field label={t('appCatalog.taglineLabel')}>
          <TextInput
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder={t('appCatalog.taglinePlaceholder')}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('appCatalog.openPathLabel')}>
            <TextInput
              mono
              value={openPath}
              onChange={(e) => setOpenPath(e.target.value)}
              placeholder="/"
              disabled={editingApp ? editingApp.kind === 'custom-url' : mode === 'custom-url' && !catalogApp}
            />
          </Field>

          {!catalogApp ? (
            <>
              <Field label={t('appCatalog.iconLabel')}>
                <Select
                  value={iconKey}
                  onChange={setIconKey}
                  options={iconKeySelectOptions}
                  searchable
                />
              </Field>
              <Field label={t('appCatalog.colorLabel')}>
                <Select
                  value={iconColor}
                  onChange={setIconColor}
                  options={iconColorSelectOptions}
                />
              </Field>
            </>
          ) : null}
        </div>

        {(catalogApp?.env?.length || 0) > 0 && !editingApp ? (
          <div className="space-y-2 pt-1">
            <div className="panel-section-label flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span>{t('appCatalog.envSectionTitle')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {catalogApp?.env.map((spec) => (
                <Field
                  key={spec.key}
                  label={language === 'id' ? spec.labelId : spec.labelEn}
                >
                  <TextInput
                    mono
                    type={spec.secret ? 'password' : 'text'}
                    value={envValues[spec.key] ?? ''}
                    onChange={(e) =>
                      setEnvValues((prev) => ({ ...prev, [spec.key]: e.target.value }))
                    }
                    placeholder={spec.placeholder || spec.defaultValue}
                    required={spec.required}
                  />
                </Field>
              ))}
            </div>
          </div>
        ) : null}

        {(editingApp?.kind === 'custom-url' || (!catalogApp && !editingApp && mode === 'custom-url')) ? (
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

