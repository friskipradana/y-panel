import { toast } from 'sonner'
import type {
  CatalogApp,
  InstallCatalogAppPayload,
  InstalledApp,
  UpdateInstalledAppPayload,
} from '@/api/appCatalog'
import {
  parseAppAccessPath,
  slugify,
  type CustomEnvEntry,
  type InstallMode,
  type TranslateFn,
} from '@/components/windows/app-catalog/installFormHelpers'
import { alertLib } from '@/lib/alert'

export function buildEditPatchPayload(params: {
  editingApp: InstalledApp
  name: string
  tagline: string
  openPath: string
  iconKey: string
  iconColor: string
  useProxy: boolean
  targetUrl: string
}): UpdateInstalledAppPayload {
  const { editingApp, name, tagline, openPath, iconKey, iconColor, useProxy, targetUrl } = params
  const defaultSlug = editingApp.slug || slugify(name) || 'app'
  const { slug: parsedSlug, subpath } = parseAppAccessPath(openPath, defaultSlug)
  return {
    name: name.trim(),
    slug: parsedSlug,
    tagline: tagline.trim(),
    iconKey,
    iconColor,
    openPath: subpath,
    useProxy,
    ...(editingApp.kind === 'custom-url' ? { targetUrl: targetUrl.trim() } : {}),
  }
}

export function mergeInstallEnv(params: {
  envValues: Record<string, string>
  customEnvs: CustomEnvEntry[]
  isReneoCrm: boolean
  currentUsername: string
}): Record<string, string> {
  const { envValues, customEnvs, isReneoCrm, currentUsername } = params
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
  return mergedEnv
}

export function buildInstallPayload(params: {
  catalogApp?: CatalogApp | null
  mode: InstallMode
  containerId: string
  name: string
  tagline: string
  openPath: string
  hostPort: string
  targetUrl: string
  iconKey: string
  iconColor: string
  useProxy: boolean
  effectiveVersion: string
  defaultTag: string
  mergedEnv: Record<string, string>
}): InstallCatalogAppPayload {
  const {
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
    effectiveVersion,
    defaultTag,
    mergedEnv,
  } = params
  const defaultSlug = catalogApp?.id || slugify(name) || 'app'
  const { slug: parsedSlug, subpath } = parseAppAccessPath(openPath, defaultSlug)
  const parsedPort = hostPort.trim() ? Number(hostPort.trim()) : undefined

  if (catalogApp) {
    return {
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
  }
  if (mode === 'existing-container') {
    return {
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
  }
  return {
    mode: 'custom-url',
    slug: parsedSlug,
    name: name.trim(),
    tagline: tagline.trim(),
    targetUrl: targetUrl.trim(),
    iconKey,
    iconColor,
    useProxy,
  }
}

export async function submitInstallWithPortRetry(params: {
  payload: InstallCatalogAppPayload
  installAsync: (payload: InstallCatalogAppPayload) => Promise<InstalledApp>
  onSwitchPort: (port: string) => void
  onSuccessApp?: (app: InstalledApp, isNew: boolean) => void
  onClose: () => void
  t: TranslateFn
}): Promise<void> {
  const { payload, installAsync, onSwitchPort, onSuccessApp, onClose, t } = params
  try {
    const created = await installAsync(payload)
    toast.success(t('appCatalog.installSuccess'))
    onSuccessApp?.(created, true)
    onClose()
  } catch (err) {
    const errData = (err as { response?: { data?: { code?: string; port?: number; suggestedPort?: number } } })
      ?.response?.data
    if (errData?.code === 'port_in_use' && typeof errData.suggestedPort === 'number' && errData.suggestedPort > 0) {
      const nextPort = errData.suggestedPort
      const ok = await alertLib.confirm(
        t('appCatalog.portInUseTitle'),
        t('appCatalog.portInUseConfirm', {
          port: String(errData.port ?? payload.hostPort ?? ''),
          suggestedPort: String(nextPort),
        }),
        t('appCatalog.portInUseSwitchBtn', { suggestedPort: String(nextPort) }),
        t('common.cancel'),
        'warning',
        'app-catalog',
      )
      if (ok) {
        onSwitchPort(String(nextPort))
        await submitInstallWithPortRetry({
          ...params,
          payload: { ...payload, hostPort: nextPort },
        })
      }
      return
    }
    toast.error(err instanceof Error ? err.message : t('appCatalog.installFailed'))
  }
}
