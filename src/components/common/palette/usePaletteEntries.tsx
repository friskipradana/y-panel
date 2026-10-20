import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Clock, Cpu, Globe, Languages, Lock, Moon, Radar, RotateCcw, StickyNote, Sun } from 'lucide-react'
import { getMySubdomains } from '@/api/hosting'
import { AppIcon } from '@/components/common/AppIcon'
import { canAccessWindow } from '@/components/desktop/windowRegistry'
import { APP_KEYWORDS, MENU_ITEMS } from '@/components/taskbar/appCatalog'
import { IconBadge } from '@/components/ui/IconBadge'
import { SETTINGS_TAB_TITLE, settingsTabAllowed, type SettingsTabKey } from '@/components/windows/settings/constants'
import { shortcutHint } from '@/hooks/useGlobalShortcuts'
import { usePublicSite } from '@/hooks/usePublicSite'
import { useI18n, windowTitleKey } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useThemeStore } from '@/store/themeStore'
import { MULTI_INSTANCE_WIDGETS, WIDGET_CATALOG, useWidgetStore, widgetAllowedFor } from '@/store/widgetStore'
import { useWindowStore } from '@/store/windowStore'
import type { WidgetType } from '@/types'

export type PaletteGroup = 'open' | 'apps' | 'account' | 'settings' | 'widgets' | 'actions'

export interface PaletteEntry {
  id: string
  group: PaletteGroup
  title: string
  description?: string
  icon: ReactNode
  /** Extra words that find this entry */
  keywords: string[]
  /** Right-hand label: a keyboard shortcut or a short tag */
  hint?: string
  disabled?: boolean
  /** Remembered in "recently used" */
  recordable?: boolean
  run: () => void
}

const RECENT_KEY = 'reneo-palette-recent'
const RECENT_MAX = 5

export function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

export function rememberRecent(id: string) {
  try {
    const next = [id, ...loadRecent().filter((item) => item !== id)].slice(0, RECENT_MAX)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // recents are a convenience
  }
}

const WIDGET_ICON: Record<WidgetType, typeof Clock> = {
  'clock-uptime': Clock,
  'system-vital': Activity,
  'network-traffic': Globe,
  'quick-note': StickyNote,
  'cpu-graph': Cpu,
  ping: Radar,
}

// Words that find a settings tab besides its title
const SETTINGS_TAB_WORDS: Record<SettingsTabKey, string[]> = {
  general: ['host', 'hostname', 'timezone', 'zona waktu', 'dns', 'update', 'pembaruan', 'bahasa', 'landing', 'indeksing', 'seo', 'robots'],
  hosting: ['hosting', 'paket', 'plan', 'harga', 'demo', 'domain', 'subdomain', 'pesan', 'masa tenggang'],
  appearance: ['tema', 'theme', 'gelap', 'terang', 'dark', 'light', 'font', 'huruf', 'ukuran'],
  wallpaper: ['wallpaper', 'latar', 'background', 'gambar'],
  desktop: ['desktop', 'ikon', 'icon', 'taskbar'],
  screensaver: ['kunci', 'lock', 'screensaver', 'layar'],
  sound: ['suara', 'audio', 'volume'],
  cloudflare: ['cloudflare', 'token', 'api'],
  network: ['jaringan', 'port', 'origin', 'host'],
  public_ip: ['ip publik', 'public ip', 'domain', 'sertifikat', 'certificate', 'https', 'letsencrypt', 'proxy', 'port forward', 'tanpa tunnel'],
  security: ['kata sandi', 'password', 'keamanan', 'database'],
  payment: ['pembayaran', 'gateway', 'midtrans', 'xendit', 'notifikasi', 'listener', 'pembaca', 'perangkat', 'device', 'transfer', 'bank', 'wimboro'],
  notifications: ['notifikasi', 'telegram', 'kabar', 'peringatan', 'serangan', 'antrian', 'whatsapp'],
  audit: ['audit', 'riwayat', 'log'],
  api_tokens: ['token', 'api', 'mcp', 'integrasi'],
  reneo_database: ['database', 'postgres', 'reneo'],
  reneo_runtime: ['runtime', 'path', 'reneo'],
}

const glyph = (node: ReactNode) => <IconBadge size="md">{node}</IconBadge>
const appGlyph = (kind: string) => (
  <IconBadge size="md">
    <AppIcon kind={kind} size={22} />
  </IconBadge>
)

// Everything the quick search can do for the signed-in account: only what the role may open,
// in the language of the panel. The search ranks them; this only decides what exists.
export function usePaletteEntries(close: () => void, enabled: boolean): PaletteEntry[] {
  const { t, language, setLanguage } = useI18n()
  const user = useAuthStore((s) => s.user)
  const role = user?.role ?? null
  const windows = useWindowStore((s) => s.windows)
  const openWindow = useWindowStore((s) => s.openWindow)
  const resetWindows = useWindowStore((s) => s.resetWindows)
  const addWidget = useWidgetStore((s) => s.addWidget)
  const resetLayout = useWidgetStore((s) => s.resetLayout)
  const hasWidget = useWidgetStore((s) => s.hasWidget)
  const requestSettingsTab = useSettingsNavStore((s) => s.request)
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const setIsLocked = useThemeStore((s) => s.setIsLocked)
  const { hosting } = usePublicSite()

  // a buyer with subdomains in their plan gets a way to their subdomains
  const mine = useQuery({
    queryKey: ['my-subdomains'],
    queryFn: getMySubdomains,
    enabled: enabled && hosting && role !== null && role !== 'superadmin' && role !== 'demo',
    staleTime: 30_000,
    retry: 0,
  })

  const go = (run: () => void) => () => {
    run()
    close()
  }
  const entries: PaletteEntry[] = []

  // windows that are open right now
  for (const win of windows) {
    if (!canAccessWindow(win.kind, role)) continue
    entries.push({
      id: `open:${win.id}`,
      group: 'open',
      title: t(windowTitleKey(win.kind)),
      description: win.isMinimized ? t('palette.minimized') : t('palette.openNow'),
      icon: appGlyph(win.kind),
      keywords: [win.kind, ...(APP_KEYWORDS[win.kind] ?? [])],
      run: go(() => openWindow(win.kind)),
    })
  }

  // applications
  const apps = [...MENU_ITEMS.map((item) => ({ kind: item.kind, desc: language === 'en' ? item.descEn : item.descId })), { kind: 'profile' as const, desc: t('palette.profile.desc') }]
  for (const app of apps) {
    if (!canAccessWindow(app.kind, role)) continue
    entries.push({
      id: `app:${app.kind}`,
      group: 'apps',
      title: t(windowTitleKey(app.kind)),
      description: app.desc,
      icon: appGlyph(app.kind),
      keywords: [app.kind, ...(APP_KEYWORDS[app.kind] ?? [])],
      hint: shortcutHint(app.kind),
      recordable: true,
      run: go(() => openWindow(app.kind)),
    })
  }

  // account: the subdomains a plan includes
  if (hosting && mine.data?.enabled && (mine.data.limit > 0 || mine.data.items.length > 0) && canAccessWindow('tunnels', role)) {
    entries.push({
      id: 'account:subdomains',
      group: 'account',
      title: t('palette.mySubdomains'),
      description: t('palette.mySubdomainsDesc', { used: mine.data.used, limit: mine.data.limit }),
      icon: appGlyph('tunnels'),
      keywords: ['subdomain', 'domain', 'hosting', 'paket', 'plan', 'situs'],
      recordable: true,
      run: go(() => openWindow('tunnels')),
    })
  }

  // settings, tab by tab, only the tabs this account has
  if (canAccessWindow('settings', role)) {
    for (const key of Object.keys(SETTINGS_TAB_TITLE) as SettingsTabKey[]) {
      if (!settingsTabAllowed(key, role)) continue
      const tabTitle = t(SETTINGS_TAB_TITLE[key])
      entries.push({
        id: `settings:${key}`,
        group: 'settings',
        title: t('palette.settingsTab', { tab: tabTitle }),
        icon: appGlyph('settings'),
        keywords: [key, tabTitle, 'settings', 'pengaturan', ...SETTINGS_TAB_WORDS[key]],
        recordable: true,
        run: go(() => {
          requestSettingsTab(key)
          openWindow('settings')
        }),
      })
    }
  }

  // widgets this role may place
  for (const item of WIDGET_CATALOG) {
    if (!widgetAllowedFor(item.type, role)) continue
    const Icon = WIDGET_ICON[item.type]
    const placed = hasWidget(item.type) && !MULTI_INSTANCE_WIDGETS.includes(item.type)
    entries.push({
      id: `widget:${item.type}`,
      group: 'widgets',
      title: t('palette.addWidget', { name: t(`widget.catalog.${item.type}.title`) }),
      description: placed ? t('palette.widgetPlaced') : t(`widget.catalog.${item.type}.subtitle`),
      icon: glyph(<Icon />),
      keywords: ['widget', item.type],
      disabled: placed,
      run: go(() => {
        addWidget(item.type)
      }),
    })
  }

  // actions
  const light = mode === 'dark'
  entries.push(
    {
      id: 'action:theme',
      group: 'actions',
      title: light ? t('public.theme.toLight') : t('public.theme.toDark'),
      icon: glyph(light ? <Sun /> : <Moon />),
      keywords: ['tema', 'theme', 'dark', 'light', 'gelap', 'terang', 'mode'],
      run: go(toggleMode),
    },
    {
      id: 'action:language',
      group: 'actions',
      title: `${t('language.label')}: ${language === 'id' ? t('language.english') : t('language.indonesian')}`,
      icon: glyph(<Languages />),
      keywords: ['bahasa', 'language', 'indonesia', 'english', 'inggris'],
      run: go(() => setLanguage(language === 'id' ? 'en' : 'id')),
    },
    {
      id: 'action:lock',
      group: 'actions',
      title: t('palette.lock'),
      description: t('palette.lockDesc'),
      icon: glyph(<Lock />),
      keywords: ['kunci', 'lock', 'layar', 'screen', 'keamanan'],
      run: go(() => setIsLocked(true)),
    },
    {
      id: 'action:reset-windows',
      group: 'actions',
      title: t('palette.resetWindows'),
      description: t('palette.resetWindowsDesc'),
      icon: glyph(<RotateCcw />),
      keywords: ['reset', 'tutup', 'close', 'window', 'jendela', 'bersihkan'],
      run: go(resetWindows),
    },
    {
      id: 'action:reset-widgets',
      group: 'actions',
      title: t('palette.resetWidgets'),
      description: t('palette.resetWidgetsDesc'),
      icon: glyph(<RotateCcw />),
      keywords: ['reset', 'widget', 'tata ulang', 'layout'],
      run: go(resetLayout),
    },
  )
  return entries
}
