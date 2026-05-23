import { create } from 'zustand'

import { getWallpaper, updateWallpaper } from '@/api/agent'

export type ThemeMode = 'light' | 'dark'
export type WallpaperKey = 'default' | 'ocean' | 'sunset' | 'forest' | 'midnight' | 'aurora' | 'custom'

export interface WallpaperDef {
  label: string
  /** CSS gradient string for light mode */
  light: string
  /** CSS gradient string for dark mode - if missing, uses universal dark overlay */
  dark?: string
}

export const WALLPAPERS: Record<Exclude<WallpaperKey, 'custom'>, WallpaperDef> = {
  default: {
    label: 'Default',
    light: 'var(--wallpaper-default-light)',
    dark: 'var(--wallpaper-default-dark)',
  },
  ocean: {
    label: 'Ocean',
    light: 'var(--wallpaper-ocean-light)',
    dark: 'var(--wallpaper-ocean-dark)',
  },
  sunset: {
    label: 'Sunset',
    light: 'var(--wallpaper-sunset-light)',
    dark: 'var(--wallpaper-sunset-dark)',
  },
  forest: {
    label: 'Forest',
    light: 'var(--wallpaper-forest-light)',
    dark: 'var(--wallpaper-forest-dark)',
  },
  midnight: {
    label: 'Midnight',
    light: 'var(--wallpaper-midnight-light)',
    dark: 'var(--wallpaper-midnight-dark)',
  },
  aurora: {
    label: 'Aurora',
    light: 'var(--wallpaper-aurora-light)',
    dark: 'var(--wallpaper-aurora-dark)',
  },
}

interface StoredTheme {
  mode?: ThemeMode
  wallpaper?: WallpaperKey
  customImageUrl?: string
}

interface ThemeStore {
  mode: ThemeMode
  wallpaper: WallpaperKey
  /** Data URL or blob URL for custom wallpaper image */
  customImageUrl: string | null
  wallpaperLoading: boolean
  setMode: (mode: ThemeMode) => void
  setWallpaper: (key: WallpaperKey) => void
  setCustomImage: (dataUrl: string) => Promise<void>
  syncCustomImage: () => Promise<void>
  toggleMode: () => void
  /** Returns the CSS background value for the current wallpaper+mode */
  getBackground: () => string
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

export const useThemeStore = create<ThemeStore>((set, get) => {
  const stored = loadStored()
  applyTheme(stored.mode ?? 'light')

  const getBackground = () => {
    const { mode, wallpaper, customImageUrl } = get()
    if (wallpaper === 'custom' && customImageUrl) {
      return `url("${customImageUrl}") center/cover no-repeat`
    }
    const def = WALLPAPERS[(wallpaper === 'custom' ? 'default' : wallpaper) as Exclude<WallpaperKey, 'custom'>] ?? WALLPAPERS.default
    return mode === 'dark' ? (def.dark ?? def.light) : def.light
  }

  return {
    mode: stored.mode ?? 'light',
    wallpaper: stored.wallpaper ?? 'default',
    customImageUrl: stored.customImageUrl ?? null,
    wallpaperLoading: false,

    setMode: (mode) => {
      applyTheme(mode)
      persist({ mode })
      set({ mode })
    },

    setWallpaper: (wallpaper) => {
      persist({ wallpaper })
      set({ wallpaper })
    },

    setCustomImage: async (dataUrl) => {
      set({ wallpaper: 'custom', customImageUrl: dataUrl, wallpaperLoading: true })
      persist({ wallpaper: 'custom' }) 
      // Do not store the heavy dataURL in localstorage
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
           
           // Jika ini adalah device baru (belum ada preferensi di localStorage),
           // gunakan custom wallpaper secara otomatis karena ada data di server.
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

    getBackground,
  }
})
