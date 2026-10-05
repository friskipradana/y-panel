import { create } from 'zustand'

import { getWallpaper, updateWallpaper } from '@/api/agent'

export type ThemeMode = 'light' | 'dark'
export type WallpaperKey =
  | 'default'
  | 'ocean'
  | 'sunset'
  | 'forest'
  | 'midnight'
  | 'aurora'
  | 'server-datacenter'
  | 'tokyo-night'
  | 'dark-mountains'
  | 'deep-nebula'
  | 'nordic-forest'
  | 'desert-dusk'
  | 'minimal-architecture'
  | 'abstract-wave'
  | 'custom'

export type WallpaperFit = 'cover' | 'contain' | 'stretch' | 'center' | 'tile'
export type DesktopIconStyle = 'framed' | 'plain'
export type DesktopIconSize = 'small' | 'medium' | 'large'
export type LockScreenStyle = 'clock' | 'matrix' | 'starfield' | 'none' | 'modern'

export interface WallpaperDef {
  label: string
  type: 'gradient' | 'image'
  /** CSS gradient string or image url for light mode */
  light: string
  /** CSS gradient string or image url for dark mode - if missing, uses universal dark overlay */
  dark?: string
  previewUrl?: string
}

export const WALLPAPERS: Record<Exclude<WallpaperKey, 'custom'>, WallpaperDef> = {
  default: {
    label: 'Default Slate',
    type: 'gradient',
    light: 'var(--wallpaper-default-light)',
    dark: 'var(--wallpaper-default-dark)',
  },
  ocean: {
    label: 'Ocean Blue',
    type: 'gradient',
    light: 'var(--wallpaper-ocean-light)',
    dark: 'var(--wallpaper-ocean-dark)',
  },
  sunset: {
    label: 'Sunset Glow',
    type: 'gradient',
    light: 'var(--wallpaper-sunset-light)',
    dark: 'var(--wallpaper-sunset-dark)',
  },
  forest: {
    label: 'Forest Green',
    type: 'gradient',
    light: 'var(--wallpaper-forest-light)',
    dark: 'var(--wallpaper-forest-dark)',
  },
  midnight: {
    label: 'Midnight Deep',
    type: 'gradient',
    light: 'var(--wallpaper-midnight-light)',
    dark: 'var(--wallpaper-midnight-dark)',
  },
  aurora: {
    label: 'Aurora Lights',
    type: 'gradient',
    light: 'var(--wallpaper-aurora-light)',
    dark: 'var(--wallpaper-aurora-dark)',
  },
  'server-datacenter': {
    label: 'Datacenter Core',
    type: 'image',
    light: '/wallpapers/server-datacenter.jpg',
    dark: '/wallpapers/server-datacenter.jpg',
    previewUrl: '/wallpapers/server-datacenter.jpg',
  },
  'tokyo-night': {
    label: 'Tokyo Cyber Night',
    type: 'image',
    light: '/wallpapers/tokyo-night.jpg',
    dark: '/wallpapers/tokyo-night.jpg',
    previewUrl: '/wallpapers/tokyo-night.jpg',
  },
  'dark-mountains': {
    label: 'Dark Mountains',
    type: 'image',
    light: '/wallpapers/dark-mountains.jpg',
    dark: '/wallpapers/dark-mountains.jpg',
    previewUrl: '/wallpapers/dark-mountains.jpg',
  },
  'deep-nebula': {
    label: 'Deep Nebula Space',
    type: 'image',
    light: '/wallpapers/deep-nebula.jpg',
    dark: '/wallpapers/deep-nebula.jpg',
    previewUrl: '/wallpapers/deep-nebula.jpg',
  },
  'nordic-forest': {
    label: 'Nordic Forest Mist',
    type: 'image',
    light: '/wallpapers/nordic-forest.jpg',
    dark: '/wallpapers/nordic-forest.jpg',
    previewUrl: '/wallpapers/nordic-forest.jpg',
  },
  'desert-dusk': {
    label: 'Desert Sunset Dunes',
    type: 'image',
    light: '/wallpapers/desert-dusk.jpg',
    dark: '/wallpapers/desert-dusk.jpg',
    previewUrl: '/wallpapers/desert-dusk.jpg',
  },
  'minimal-architecture': {
    label: 'Minimalist Architecture',
    type: 'image',
    light: '/wallpapers/minimal-architecture.jpg',
    dark: '/wallpapers/minimal-architecture.jpg',
    previewUrl: '/wallpapers/minimal-architecture.jpg',
  },
  'abstract-wave': {
    label: 'Abstract Wave Mesh',
    type: 'image',
    light: '/wallpapers/abstract-wave.jpg',
    dark: '/wallpapers/abstract-wave.jpg',
    previewUrl: '/wallpapers/abstract-wave.jpg',
  },
}

interface StoredTheme {
  mode?: ThemeMode
  wallpaper?: WallpaperKey
  wallpaperFit?: WallpaperFit
  customImageUrl?: string | null
  desktopIconStyle?: DesktopIconStyle
  desktopIconSize?: DesktopIconSize
  lockScreenStyle?: LockScreenStyle
  lockScreenEnabled?: boolean
  requirePasswordOnWake?: boolean
  soundEnabled?: boolean
  soundVolume?: number
  autoLockTimeout?: number
}

interface ThemeStore {
  mode: ThemeMode
  wallpaper: WallpaperKey
  wallpaperFit: WallpaperFit
  /** Data URL or blob URL for custom wallpaper image */
  customImageUrl: string | null
  desktopIconStyle: DesktopIconStyle
  desktopIconSize: DesktopIconSize
  lockScreenStyle: LockScreenStyle
  lockScreenEnabled: boolean
  requirePasswordOnWake: boolean
  wallpaperLoading: boolean
  soundEnabled: boolean
  soundVolume: number
  autoLockTimeout: number // in minutes: 0 = never, 5, 15, 30, 60
  isLocked: boolean
  setMode: (mode: ThemeMode) => void
  setWallpaper: (key: WallpaperKey) => void
  setWallpaperFit: (fit: WallpaperFit) => void
  setDesktopIconStyle: (style: DesktopIconStyle) => void
  setDesktopIconSize: (size: DesktopIconSize) => void
  setLockScreenStyle: (style: LockScreenStyle) => void
  setLockScreenEnabled: (enabled: boolean) => void
  setRequirePasswordOnWake: (require: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
  setAutoLockTimeout: (timeout: number) => void
  setIsLocked: (locked: boolean) => void
  setCustomImage: (dataUrl: string) => Promise<void>
  syncCustomImage: () => Promise<void>
  toggleMode: () => void
  /** Returns the CSS background value for the current wallpaper+mode */
  getBackground: () => string
  /** Returns complete CSS properties object for desktop wallpaper rendering */
  getBackgroundStyle: () => React.CSSProperties
}

const loadStored = (): StoredTheme => {
  try {
    return JSON.parse(localStorage.getItem('ui-panel-theme') ?? '{}')
  } catch {
    return {}
  }
}

const persist = (data: Partial<StoredTheme>) => {
  try {
    const existing = loadStored()
    localStorage.setItem('ui-panel-theme', JSON.stringify({ ...existing, ...data }))
  } catch {}
}

const applyTheme = (mode: ThemeMode) => {
  document.documentElement.setAttribute('data-theme', mode)
}

const formatImageBackground = (url: string, fit: WallpaperFit) => {
  switch (fit) {
    case 'contain':
      return `url("${url}") center / contain no-repeat #0b0f19`
    case 'stretch':
      return `url("${url}") center / 100% 100% no-repeat #0b0f19`
    case 'center':
      return `url("${url}") center / auto no-repeat #0b0f19`
    case 'tile':
      return `url("${url}") top left / auto repeat`
    case 'cover':
    default:
      return `url("${url}") center / cover no-repeat`
  }
}

const getImageStyle = (url: string, fit: WallpaperFit): React.CSSProperties => {
  const base: React.CSSProperties = {
    backgroundImage: `url("${url}")`,
    backgroundColor: '#0b0f19',
  }
  switch (fit) {
    case 'contain':
      return { ...base, backgroundPosition: 'center', backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }
    case 'stretch':
      return { ...base, backgroundPosition: 'center', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }
    case 'center':
      return { ...base, backgroundPosition: 'center', backgroundSize: 'auto', backgroundRepeat: 'no-repeat' }
    case 'tile':
      return { ...base, backgroundPosition: 'top left', backgroundSize: 'auto', backgroundRepeat: 'repeat' }
    case 'cover':
    default:
      return { ...base, backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat' }
  }
}

export const useThemeStore = create<ThemeStore>((set, get) => {
  const stored = loadStored()
  applyTheme(stored.mode ?? 'light')

  const getBackground = () => {
    const { mode, wallpaper, wallpaperFit, customImageUrl } = get()
    if (wallpaper === 'custom' && customImageUrl) {
      return formatImageBackground(customImageUrl, wallpaperFit)
    }
    const def = WALLPAPERS[(wallpaper === 'custom' ? 'default' : wallpaper) as Exclude<WallpaperKey, 'custom'>] ?? WALLPAPERS.default
    const bgVal = mode === 'dark' ? (def.dark ?? def.light) : def.light
    if (def.type === 'image') {
      return formatImageBackground(bgVal, wallpaperFit)
    }
    return bgVal
  }

  const getBackgroundStyle = (): React.CSSProperties => {
    const { mode, wallpaper, wallpaperFit, customImageUrl } = get()
    if (wallpaper === 'custom' && customImageUrl) {
      return getImageStyle(customImageUrl, wallpaperFit)
    }
    const def = WALLPAPERS[(wallpaper === 'custom' ? 'default' : wallpaper) as Exclude<WallpaperKey, 'custom'>] ?? WALLPAPERS.default
    const bgVal = mode === 'dark' ? (def.dark ?? def.light) : def.light
    if (def.type === 'image') {
      return getImageStyle(bgVal, wallpaperFit)
    }
    return {
      background: bgVal,
      backgroundColor: mode === 'dark' ? '#0b0f19' : '#f8fafc',
    }
  }

  return {
    mode: stored.mode ?? 'light',
    wallpaper: stored.wallpaper ?? 'default',
    wallpaperFit: stored.wallpaperFit ?? 'cover',
    customImageUrl: stored.customImageUrl ?? null,
    desktopIconStyle: stored.desktopIconStyle ?? 'framed',
    desktopIconSize: stored.desktopIconSize ?? 'small',
    lockScreenStyle: stored.lockScreenStyle ?? 'clock',
    lockScreenEnabled: stored.lockScreenEnabled ?? true,
    requirePasswordOnWake: stored.requirePasswordOnWake ?? true,
    wallpaperLoading: false,
    soundEnabled: stored.soundEnabled ?? true,
    soundVolume: stored.soundVolume ?? 0.7,
    autoLockTimeout: stored.autoLockTimeout ?? 0,
    isLocked: false,
    getBackground,
    getBackgroundStyle,

    setMode: (mode) => {
      applyTheme(mode)
      persist({ mode })
      set({ mode })
    },

    setWallpaper: (wallpaper) => {
      persist({ wallpaper })
      set({ wallpaper })
    },

    setWallpaperFit: (wallpaperFit) => {
      persist({ wallpaperFit })
      set({ wallpaperFit })
    },

    setDesktopIconStyle: (desktopIconStyle) => {
      persist({ desktopIconStyle })
      set({ desktopIconStyle })
    },

    setDesktopIconSize: (desktopIconSize) => {
      persist({ desktopIconSize })
      set({ desktopIconSize })
    },

    setLockScreenStyle: (lockScreenStyle) => {
      persist({ lockScreenStyle })
      set({ lockScreenStyle })
    },

    setLockScreenEnabled: (lockScreenEnabled) => {
      persist({ lockScreenEnabled })
      set({ lockScreenEnabled })
    },

    setRequirePasswordOnWake: (requirePasswordOnWake) => {
      persist({ requirePasswordOnWake })
      set({ requirePasswordOnWake })
    },

    setSoundEnabled: (soundEnabled) => {
      persist({ soundEnabled })
      set({ soundEnabled })
    },

    setSoundVolume: (soundVolume) => {
      persist({ soundVolume })
      set({ soundVolume })
    },

    setAutoLockTimeout: (autoLockTimeout) => {
      persist({ autoLockTimeout })
      set({ autoLockTimeout })
    },

    setIsLocked: (isLocked) => {
      set({ isLocked })
    },

    setCustomImage: async (dataUrl) => {
      set({ wallpaper: 'custom', customImageUrl: dataUrl, wallpaperLoading: true })
      persist({ wallpaper: 'custom' }) 
      try {
        await updateWallpaper(dataUrl)
      } catch (err) {
         console.error('Failed to sync wallpaper', err)
      } finally {
        set({ wallpaperLoading: false })
      }
    },

    syncCustomImage: async () => {
      set({ wallpaperLoading: true })
      try {
        const res = await getWallpaper()
        if (res && res.data) {
           set({ customImageUrl: res.data })
           try {
             const stored = JSON.parse(localStorage.getItem('ui-panel-theme') ?? '{}')
             if (!stored.wallpaper) {
               set({ wallpaper: 'custom' })
               persist({ wallpaper: 'custom' })
             }
           } catch {
             // ignore
           }
        }
      } catch (err) {
        // ignore
      } finally {
        set({ wallpaperLoading: false })
      }
    },

    toggleMode: () => {
      set((s) => {
        const mode: ThemeMode = s.mode === 'light' ? 'dark' : 'light'
        applyTheme(mode)
        persist({ mode })
        return { mode }
      })
    },
  }
})
