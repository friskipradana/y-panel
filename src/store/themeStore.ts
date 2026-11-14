import { create } from 'zustand'

import { getWallpaper, updateWallpaper } from '@/api/agent'
import {
  applyCustomColorVars,
  clearCustomColorVars,
  DEFAULT_CUSTOM_THEME_COLOR,
  normalizeHexColor,
  type ColorTheme,
} from './colorTheme'

export type { ColorTheme }
export { DEFAULT_CUSTOM_THEME_COLOR, normalizeHexColor }
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
export type DesktopIconFontSize = 'small' | 'medium' | 'large'
export type DesktopIconFontWeight = 'normal' | 'medium' | 'bold'
export type LockScreenStyle = 'clock' | 'matrix' | 'starfield' | 'none' | 'modern'
export type FontFamilyKey = 'outfit' | 'inter' | 'plus-jakarta-sans' | 'geist' | 'roboto'
export type FontSizeKey = 'small' | 'medium' | 'large'

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
  colorTheme?: ColorTheme
  customThemeColor?: string
  wallpaper?: WallpaperKey
  wallpaperFit?: WallpaperFit
  customImageUrl?: string | null
  desktopIconStyle?: DesktopIconStyle
  desktopIconSize?: DesktopIconSize
  desktopIconFontSize?: DesktopIconFontSize
  desktopIconFontWeight?: DesktopIconFontWeight
  desktopIconShadow?: boolean
  lockScreenStyle?: LockScreenStyle
  lockScreenEnabled?: boolean
  requirePasswordOnWake?: boolean
  wakeOnMouseMove?: boolean
  soundEnabled?: boolean
  soundVolume?: number
  autoLockTimeout?: number
  fontFamily?: FontFamilyKey
  fontSize?: FontSizeKey
}

interface ThemeStore {
  mode: ThemeMode
  colorTheme: ColorTheme
  customThemeColor: string
  wallpaper: WallpaperKey
  wallpaperFit: WallpaperFit
  /** Data URL or blob URL for custom wallpaper image */
  customImageUrl: string | null
  desktopIconStyle: DesktopIconStyle
  desktopIconSize: DesktopIconSize
  desktopIconFontSize: DesktopIconFontSize
  desktopIconFontWeight: DesktopIconFontWeight
  desktopIconShadow: boolean
  lockScreenStyle: LockScreenStyle
  lockScreenEnabled: boolean
  requirePasswordOnWake: boolean
  wakeOnMouseMove: boolean
  wallpaperLoading: boolean
  soundEnabled: boolean
  soundVolume: number
  autoLockTimeout: number // in minutes: 0 = never, 5, 15, 30, 60
  isLocked: boolean
  fontFamily: FontFamilyKey
  fontSize: FontSizeKey
  setMode: (mode: ThemeMode) => void
  setColorTheme: (colorTheme: ColorTheme) => void
  setCustomThemeColor: (hex: string) => void
  setWallpaper: (key: WallpaperKey) => void
  setWallpaperFit: (fit: WallpaperFit) => void
  setDesktopIconStyle: (style: DesktopIconStyle) => void
  setDesktopIconSize: (size: DesktopIconSize) => void
  setDesktopIconFontSize: (size: DesktopIconFontSize) => void
  setDesktopIconFontWeight: (weight: DesktopIconFontWeight) => void
  setDesktopIconShadow: (shadow: boolean) => void
  setLockScreenStyle: (style: LockScreenStyle) => void
  setLockScreenEnabled: (enabled: boolean) => void
  setRequirePasswordOnWake: (require: boolean) => void
  setWakeOnMouseMove: (enabled: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
  setAutoLockTimeout: (timeout: number) => void
  setIsLocked: (locked: boolean) => void
  setFontFamily: (font: FontFamilyKey) => void
  setFontSize: (size: FontSizeKey) => void
  setCustomImage: (dataUrl: string) => Promise<void>
  clearCustomImage: () => Promise<void>
  syncCustomImage: () => Promise<void>
  switchUserScope: (user: { id?: number; username?: string } | null) => void
  toggleMode: () => void
  resetToDefaults: () => void
  /** Returns the CSS background value for the current wallpaper+mode */
  getBackground: () => string
  /** Returns complete CSS properties object for desktop wallpaper rendering */
  getBackgroundStyle: () => React.CSSProperties
}

const THEME_DEFAULTS: Required<StoredTheme> = {
  mode: 'light',
  colorTheme: 'blue',
  customThemeColor: DEFAULT_CUSTOM_THEME_COLOR,
  wallpaper: 'default',
  wallpaperFit: 'cover',
  customImageUrl: null,
  desktopIconStyle: 'framed',
  desktopIconSize: 'small',
  desktopIconFontSize: 'medium',
  desktopIconFontWeight: 'medium',
  desktopIconShadow: true,
  lockScreenStyle: 'clock',
  lockScreenEnabled: true,
  requirePasswordOnWake: true,
  wakeOnMouseMove: true,
  soundEnabled: true,
  soundVolume: 0.7,
  autoLockTimeout: 0,
  fontFamily: 'outfit',
  fontSize: 'medium',
}

function resolveUserScope(user: { id?: number; username?: string } | null | undefined): string | null {
  if (!user) return null
  if (typeof user.id === 'number' && user.id > 0) return String(user.id)
  if (user.username) return user.username
  return null
}

function readInitialUserScope(): string | null {
  try {
    const raw = localStorage.getItem('me-v2-cache')
    if (!raw) return null
    return resolveUserScope(JSON.parse(raw))
  } catch {
    return null
  }
}

let activeUserScope: string | null = readInitialUserScope()

const getThemeStorageKey = (scope: string | null = activeUserScope) =>
  scope ? `reneo-theme:${scope}` : 'reneo-theme:guest'

const isValidWallpaperKey = (val: unknown): val is WallpaperKey =>
  val === 'custom' || (typeof val === 'string' && val in WALLPAPERS)

const isValidWallpaperFit = (val: unknown): val is WallpaperFit =>
  val === 'cover' || val === 'contain' || val === 'stretch' || val === 'center' || val === 'tile'

const loadStored = (scope: string | null = activeUserScope): StoredTheme => {
  try {
    return JSON.parse(localStorage.getItem(getThemeStorageKey(scope)) ?? '{}')
  } catch {
    return {}
  }
}

const persist = (data: Partial<StoredTheme>) => {
  try {
    const key = getThemeStorageKey()
    const existing = loadStored()
    localStorage.setItem(key, JSON.stringify({ ...existing, ...data }))
  } catch {}
}

const applyTheme = (mode: ThemeMode, colorTheme: ColorTheme, customColor: string) => {
  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.setAttribute('data-color-theme', colorTheme)
  if (colorTheme === 'custom') {
    applyCustomColorVars(customColor, mode)
  } else {
    clearCustomColorVars()
  }
}

const applyFontFamily = (font: FontFamilyKey) => {
  document.documentElement.setAttribute('data-font', font)
}

const applyFontSize = (size: FontSizeKey) => {
  document.documentElement.setAttribute('data-font-size', size)
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
  const initialMode: ThemeMode = stored.mode ?? 'light'
  const initialColorTheme: ColorTheme = stored.colorTheme ?? 'blue'
  const initialCustomColor = normalizeHexColor(stored.customThemeColor ?? '') ?? DEFAULT_CUSTOM_THEME_COLOR
  applyTheme(initialMode, initialColorTheme, initialCustomColor)
  applyFontFamily(stored.fontFamily ?? 'outfit')
  applyFontSize(stored.fontSize ?? 'medium')

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
    mode: initialMode,
    colorTheme: initialColorTheme,
    customThemeColor: initialCustomColor,
    wallpaper: stored.wallpaper ?? 'default',
    wallpaperFit: stored.wallpaperFit ?? 'cover',
    customImageUrl: stored.customImageUrl ?? null,
    desktopIconStyle: stored.desktopIconStyle ?? 'framed',
    desktopIconSize: stored.desktopIconSize ?? 'small',
    desktopIconFontSize: stored.desktopIconFontSize ?? 'medium',
    desktopIconFontWeight: stored.desktopIconFontWeight ?? 'medium',
    desktopIconShadow: stored.desktopIconShadow ?? true,
    lockScreenStyle: stored.lockScreenStyle ?? 'clock',
    lockScreenEnabled: stored.lockScreenEnabled ?? true,
    requirePasswordOnWake: stored.requirePasswordOnWake ?? true,
    wakeOnMouseMove: stored.wakeOnMouseMove ?? true,
    wallpaperLoading: false,
    soundEnabled: stored.soundEnabled ?? true,
    soundVolume: stored.soundVolume ?? 0.7,
    autoLockTimeout: stored.autoLockTimeout ?? 0,
    isLocked: false,
    fontFamily: stored.fontFamily ?? 'outfit',
    fontSize: stored.fontSize ?? 'medium',
    getBackground,
    getBackgroundStyle,

    setFontFamily: (fontFamily) => {
      applyFontFamily(fontFamily)
      persist({ fontFamily })
      set({ fontFamily })
    },

    setFontSize: (fontSize) => {
      applyFontSize(fontSize)
      persist({ fontSize })
      set({ fontSize })
    },

    setDesktopIconFontSize: (desktopIconFontSize) => {
      persist({ desktopIconFontSize })
      set({ desktopIconFontSize })
    },

    setDesktopIconFontWeight: (desktopIconFontWeight) => {
      persist({ desktopIconFontWeight })
      set({ desktopIconFontWeight })
    },

    setDesktopIconShadow: (desktopIconShadow) => {
      persist({ desktopIconShadow })
      set({ desktopIconShadow })
    },

    setMode: (mode) => {
      const currentColorTheme = get().colorTheme
      const colorTheme: ColorTheme =
        mode === 'dark' && currentColorTheme === 'white'
          ? 'black'
          : mode === 'light' && currentColorTheme === 'black'
            ? 'white'
            : currentColorTheme
      applyTheme(mode, colorTheme, get().customThemeColor)
      persist({ mode, colorTheme })
      set({ mode, colorTheme })
    },

    setColorTheme: (colorTheme) => {
      const mode: ThemeMode =
        colorTheme === 'white'
          ? 'light'
          : colorTheme === 'black'
            ? 'dark'
            : get().mode
      applyTheme(mode, colorTheme, get().customThemeColor)
      persist({ mode, colorTheme })
      set({ mode, colorTheme })
    },

    setCustomThemeColor: (hex) => {
      const normalized = normalizeHexColor(hex)
      if (!normalized) return
      const mode = get().mode
      applyTheme(mode, 'custom', normalized)
      persist({ colorTheme: 'custom', customThemeColor: normalized })
      set({ colorTheme: 'custom', customThemeColor: normalized })
    },

    setWallpaper: (wallpaper) => {
      persist({ wallpaper })
      set({ wallpaper })
      if (activeUserScope) {
        void updateWallpaper({ wallpaper }).catch(() => {})
      }
    },

    setWallpaperFit: (wallpaperFit) => {
      persist({ wallpaperFit })
      set({ wallpaperFit })
      if (activeUserScope) {
        void updateWallpaper({ fit: wallpaperFit }).catch(() => {})
      }
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

    setWakeOnMouseMove: (wakeOnMouseMove) => {
      persist({ wakeOnMouseMove })
      set({ wakeOnMouseMove })
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
      const fit = get().wallpaperFit
      set({ wallpaper: 'custom', customImageUrl: dataUrl, wallpaperLoading: true })
      persist({ wallpaper: 'custom', customImageUrl: dataUrl })
      try {
        await updateWallpaper({ data: dataUrl, wallpaper: 'custom', fit })
      } catch {
        // ignore wallpaper sync error
      } finally {
        set({ wallpaperLoading: false })
      }
    },

    clearCustomImage: async () => {
      const fallback: WallpaperKey = 'dark-mountains'
      set({ customImageUrl: null, wallpaper: fallback })
      persist({ customImageUrl: null, wallpaper: fallback })
      try {
        await updateWallpaper({ wallpaper: fallback, clearCustom: true })
      } catch {
        // ignore wallpaper sync error
      }
    },

    syncCustomImage: async () => {
      if (!activeUserScope) return
      const isCustom = get().wallpaper === 'custom'
      if (isCustom && !get().customImageUrl) {
        set({ wallpaperLoading: true })
      }
      try {
        const res = await getWallpaper()
        const customImageUrl = res?.data ? res.data : null
        const updates: Partial<StoredTheme> = { customImageUrl }

        if (isValidWallpaperKey(res?.wallpaper)) {
          if (res.wallpaper === 'custom' && !customImageUrl) {
            updates.wallpaper = 'default'
          } else {
            updates.wallpaper = res.wallpaper
          }
        } else if (!customImageUrl && get().wallpaper === 'custom') {
          updates.wallpaper = 'default'
        }

        if (isValidWallpaperFit(res?.fit)) {
          updates.wallpaperFit = res.fit
        }

        persist(updates)
        set(updates)
      } catch {
        // ignore
      } finally {
        set({ wallpaperLoading: false })
      }
    },

    switchUserScope: (user) => {
      const nextScope = resolveUserScope(user)
      if (nextScope === activeUserScope) return
      activeUserScope = nextScope
      const nextStored = loadStored(nextScope)
      const mode: ThemeMode = nextStored.mode ?? THEME_DEFAULTS.mode
      const colorTheme: ColorTheme = nextStored.colorTheme ?? THEME_DEFAULTS.colorTheme
      const customThemeColor =
        normalizeHexColor(nextStored.customThemeColor ?? '') ?? THEME_DEFAULTS.customThemeColor
      const fontFamily = nextStored.fontFamily ?? THEME_DEFAULTS.fontFamily
      const fontSize = nextStored.fontSize ?? THEME_DEFAULTS.fontSize

      applyTheme(mode, colorTheme, customThemeColor)
      applyFontFamily(fontFamily)
      applyFontSize(fontSize)

      set({
        ...THEME_DEFAULTS,
        ...nextStored,
        mode,
        colorTheme,
        customThemeColor,
        fontFamily,
        fontSize,
        isLocked: false,
        wallpaperLoading: false,
      })
    },

    toggleMode: () => {
      set((s) => {
        const mode: ThemeMode = s.mode === 'light' ? 'dark' : 'light'
        const colorTheme: ColorTheme =
          mode === 'dark' && s.colorTheme === 'white'
            ? 'black'
            : mode === 'light' && s.colorTheme === 'black'
              ? 'white'
              : s.colorTheme
        applyTheme(mode, colorTheme, s.customThemeColor)
        persist({ mode, colorTheme })
        return { mode, colorTheme }
      })
    },

    resetToDefaults: () => {
      const defaults: StoredTheme = {
        mode: 'light',
        colorTheme: 'blue',
        customThemeColor: DEFAULT_CUSTOM_THEME_COLOR,
        wallpaper: 'default',
        wallpaperFit: 'cover',
        customImageUrl: null,
        desktopIconStyle: 'framed',
        desktopIconSize: 'small',
        desktopIconFontSize: 'medium',
        desktopIconFontWeight: 'medium',
        desktopIconShadow: true,
        lockScreenStyle: 'clock',
        lockScreenEnabled: true,
        requirePasswordOnWake: true,
        wakeOnMouseMove: true,
        soundEnabled: true,
        soundVolume: 0.7,
        autoLockTimeout: 0,
        fontFamily: 'outfit',
        fontSize: 'medium',
      }
      applyTheme('light', 'blue', DEFAULT_CUSTOM_THEME_COLOR)
      applyFontFamily('outfit')
      applyFontSize('medium')
      try {
        localStorage.setItem(getThemeStorageKey(), JSON.stringify(defaults))
      } catch {}
      set({
        ...defaults,
        isLocked: false,
        wallpaperLoading: false,
      })
    },
  }
})
