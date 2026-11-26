import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import {
  formatSingleVersionTag,
  isFloatingTag,
  orderCatalogVersionChoices,
} from '@/components/windows/app-catalog/versionHelpers'
import type { useI18n } from '@/lib/i18n'

export type InstallMode = 'existing-container' | 'custom-url' | 'custom-catalog'
export type IconSourceMode = 'preset' | 'url'
export type TranslateFn = ReturnType<typeof useI18n>['t']

export interface CustomEnvEntry {
  key: string
  value: string
}

export const CUSTOM_VERSION_SENTINEL = '__custom__'

export const ICON_KEY_OPTIONS = [
  'uptime-kuma', 'filebrowser', 'it-tools', 'n8n', 'vaultwarden', 'grafana',
  'stirling-pdf', 'excalidraw', 'gitea', 'memos', 'reneo-crm',
  'adguard-home', 'jellyfin', 'nextcloud', 'nginx-proxy-manager', 'open-webui',
  'beszel', 'actual-budget', 'vikunja', 'metube', 'pairdrop',
  'activity', 'folder', 'wrench', 'workflow', 'shield', 'bar-chart',
  'file-text', 'pen-tool', 'git-branch', 'notebook', 'globe', 'box',
  'server', 'database', 'terminal',
]

export const ICON_COLOR_OPTIONS = [
  'blue', 'emerald', 'amber', 'cyan', 'sky', 'teal',
  'violet', 'indigo', 'rose', 'orange', 'slate',
]

export const CATALOG_CATEGORY_OPTIONS = [
  { value: 'tools', label: 'Tools' },
  { value: 'automation', label: 'Automation' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'security', label: 'Security' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'media', label: 'Media' },
]

export function splitImageRepoTag(image: string): { repo: string; tag: string } {
  const trimmed = image.trim()
  const lastSlash = trimmed.lastIndexOf('/')
  const lastColon = trimmed.lastIndexOf(':')
  if (lastColon > lastSlash) {
    return { repo: trimmed.slice(0, lastColon), tag: trimmed.slice(lastColon + 1) }
  }
  return { repo: trimmed, tag: 'latest' }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function parseAppAccessPath(raw: string, defaultSlug: string): { slug: string; subpath: string } {
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

export function normalizeEditingOpenPath(editingApp: InstalledApp): string {
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
  return `/app/${currentSlug}${currentSub}`
}

export function buildInitialCatalogEnv(catalogApp: CatalogApp, currentUsername: string): Record<string, string> {
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
  return nextEnv
}

export interface VersionSelectionState {
  imageRepo: string
  defaultTag: string
  versionOptions: { value: string; label: string }[]
  effectiveVersion: string
  resolvedImage: string
  latestConcreteVersion: string
}

export function buildVersionSelectionState(params: {
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  editingCatalogApp?: CatalogApp
  selectedVersion: string
  customVersion: string
  t: TranslateFn
}): VersionSelectionState {
  const { catalogApp, editingApp, editingCatalogApp, selectedVersion, customVersion, t } = params
  const sourceImage = catalogApp
    ? catalogApp.image
    : editingApp && editingApp.kind !== 'custom-url'
      ? editingApp.image
      : ''
  if (!sourceImage) {
    return {
      imageRepo: '',
      defaultTag: '',
      versionOptions: [],
      effectiveVersion: '',
      resolvedImage: '',
      latestConcreteVersion: '',
    }
  }
  const parsed = splitImageRepoTag(sourceImage)
  const presetSource = catalogApp?.versions ?? editingCatalogApp?.versions ?? []
  const { ordered, latestConcrete } = orderCatalogVersionChoices(presetSource, parsed.tag)
  const options = [
    ...ordered.map((v) => {
      if (isFloatingTag(v)) {
        return { value: v, label: `${v} ${t('appCatalog.versionRollingSuffix')}` }
      }
      if (latestConcrete && v === latestConcrete) {
        return {
          value: v,
          label: `${formatSingleVersionTag(v)} ${t('appCatalog.versionRecommendedSuffix')}`,
        }
      }
      if (!latestConcrete && v === parsed.tag) {
        return {
          value: v,
          label: `${formatSingleVersionTag(v)} ${t('appCatalog.versionDefaultSuffix')}`,
        }
      }
      return { value: v, label: formatSingleVersionTag(v) }
    }),
    { value: CUSTOM_VERSION_SENTINEL, label: t('appCatalog.versionCustomOption') },
  ]
  const chosen =
    selectedVersion === CUSTOM_VERSION_SENTINEL
      ? customVersion.trim() || parsed.tag
      : selectedVersion || latestConcrete || parsed.tag
  return {
    imageRepo: parsed.repo,
    defaultTag: parsed.tag,
    versionOptions: options,
    effectiveVersion: chosen,
    resolvedImage: `${parsed.repo}:${chosen}`,
    latestConcreteVersion: latestConcrete,
  }
}
