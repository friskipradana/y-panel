import { Activity, Bell, Clock, Cloud, CreditCard, Database, Globe2, ImagePlus, Key, Lock, LockKeyhole, Monitor, Palette, Server, Store, Volume2 } from 'lucide-react'
import type { ComponentType } from 'react'
import type { SettingsTabKey } from './constants'

export interface SettingsTabDef {
  key: SettingsTabKey
  /** i18n key of the name in the menu */
  label: string
  /** i18n key of the line under the title of the page */
  desc: string
  icon: ComponentType<{ size?: number; className?: string }>
}

export interface SettingsGroupDef {
  key: string
  /** i18n key of the name of the group */
  label: string
  tabs: SettingsTabDef[]
}

// The menu, by what a setting is about. A group with nothing the account may open is left out.
export const SETTINGS_GROUPS: SettingsGroupDef[] = [
  {
    key: 'server',
    label: 'settings.group.server',
    tabs: [
      { key: 'general', label: 'settings.tabs.general', desc: 'settings.desc.general', icon: Server },
      { key: 'network', label: 'settings.tabs.network', desc: 'settings.desc.network', icon: Globe2 },
      { key: 'reneo_runtime', label: 'settings.tabs.reneoRuntime', desc: 'settings.desc.reneoRuntime', icon: Activity },
      { key: 'reneo_database', label: 'settings.tabs.reneoDatabase', desc: 'settings.desc.reneoDatabase', icon: Database },
    ],
  },
  {
    key: 'business',
    label: 'settings.group.business',
    tabs: [
      { key: 'hosting', label: 'settings.tabs.hosting', desc: 'settings.desc.hosting', icon: Store },
      { key: 'payment', label: 'settings.tabs.payment', desc: 'settings.desc.payment', icon: CreditCard },
    ],
  },
  {
    key: 'desktop',
    label: 'settings.group.desktop',
    tabs: [
      { key: 'appearance', label: 'settings.tabs.appearance', desc: 'settings.desc.appearance', icon: Palette },
      { key: 'wallpaper', label: 'settings.tabs.wallpaper', desc: 'settings.desc.wallpaper', icon: ImagePlus },
      { key: 'desktop', label: 'settings.tabs.desktop', desc: 'settings.desc.desktop', icon: Monitor },
      { key: 'screensaver', label: 'settings.tabs.screensaver', desc: 'settings.desc.screensaver', icon: Lock },
      { key: 'sound', label: 'settings.tabs.sound', desc: 'settings.desc.sound', icon: Volume2 },
    ],
  },
  {
    key: 'integration',
    label: 'settings.group.integration',
    tabs: [
      { key: 'cloudflare', label: 'settings.tabs.cloudflare', desc: 'settings.desc.cloudflare', icon: Cloud },
      { key: 'api_tokens', label: 'settings.tabs.apiTokens', desc: 'settings.desc.apiTokens', icon: Key },
      { key: 'notifications', label: 'settings.tabs.notifications', desc: 'settings.desc.notifications', icon: Bell },
    ],
  },
  {
    key: 'security',
    label: 'settings.group.security',
    tabs: [
      { key: 'security', label: 'settings.tabs.security', desc: 'settings.desc.security', icon: LockKeyhole },
      { key: 'audit', label: 'settings.tabs.audit', desc: 'settings.desc.audit', icon: Clock },
    ],
  },
]
