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
    light: `radial-gradient(circle at top left, rgba(249,115,22,0.18), transparent 24%),
            radial-gradient(circle at top right, rgba(14,165,233,0.16), transparent 28%),
            linear-gradient(180deg, #f8fafc 0%, #eef2ff 45%, #e2e8f0 100%)`,
    dark: `radial-gradient(circle at top left, rgba(139,92,246,0.18), transparent 28%),
           radial-gradient(circle at top right, rgba(59,130,246,0.14), transparent 30%),
           linear-gradient(180deg, #0f172a 0%, #111827 60%, #0b1120 100%)`,
  },
  ocean: {
    label: 'Ocean',
    light: `radial-gradient(circle at top left, rgba(6,182,212,0.22), transparent 30%),
            radial-gradient(circle at bottom right, rgba(59,130,246,0.20), transparent 35%),
            linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)`,
    dark: `radial-gradient(circle at top left, rgba(6,182,212,0.18), transparent 30%),
           radial-gradient(circle at bottom right, rgba(59,130,246,0.16), transparent 35%),
           linear-gradient(180deg, #0c1a2e 0%, #0f2744 55%, #0a1e38 100%)`,
  },
  sunset: {
    label: 'Sunset',
    light: `radial-gradient(circle at 20% 30%, rgba(251,146,60,0.30), transparent 30%),
            radial-gradient(circle at 80% 10%, rgba(244,63,94,0.22), transparent 28%),
            linear-gradient(160deg, #fff7ed 0%, #fef3c7 40%, #fde68a 100%)`,
    dark: `radial-gradient(circle at 20% 30%, rgba(251,146,60,0.22), transparent 30%),
           radial-gradient(circle at 80% 10%, rgba(244,63,94,0.18), transparent 28%),
           linear-gradient(160deg, #1a0a00 0%, #2d1500 45%, #1f0c00 100%)`,
  },
  forest: {
    label: 'Forest',
    light: `radial-gradient(circle at top left, rgba(34,197,94,0.18), transparent 26%),
            radial-gradient(circle at bottom right, rgba(20,184,166,0.16), transparent 30%),
            linear-gradient(180deg, #f0fdf4 0%, #dcfce7 50%, #d1fae5 100%)`,
    dark: `radial-gradient(circle at top left, rgba(34,197,94,0.14), transparent 26%),
           radial-gradient(circle at bottom right, rgba(20,184,166,0.12), transparent 30%),
           linear-gradient(180deg, #051a0a 0%, #0a2e14 55%, #071a0d 100%)`,
  },
  midnight: {
    label: 'Midnight',
    light: `radial-gradient(circle at 15% 20%, rgba(139,92,246,0.25), transparent 30%),
            radial-gradient(circle at 85% 80%, rgba(59,130,246,0.20), transparent 30%),
            linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)`,
    dark: `radial-gradient(circle at 15% 20%, rgba(139,92,246,0.30), transparent 30%),
           radial-gradient(circle at 85% 80%, rgba(59,130,246,0.25), transparent 30%),
           linear-gradient(135deg, #0a0f1e 0%, #120f36 50%, #0a0f1e 100%)`,
  },
  aurora: {
    label: 'Aurora',
    light: `radial-gradient(circle at 20% 40%, rgba(52,211,153,0.22), transparent 30%),
            radial-gradient(circle at 75% 20%, rgba(167,139,250,0.22), transparent 28%),
            radial-gradient(circle at 50% 90%, rgba(96,165,250,0.18), transparent 30%),
            linear-gradient(160deg, #ecfdf5 0%, #ede9fe 50%, #dbeafe 100%)`,
    dark: `radial-gradient(circle at 20% 40%, rgba(52,211,153,0.18), transparent 30%),
           radial-gradient(circle at 75% 20%, rgba(167,139,250,0.20), transparent 28%),
           radial-gradient(circle at 50% 90%, rgba(96,165,250,0.14), transparent 30%),
           linear-gradient(160deg, #041a12 0%, #0f0a2e 50%, #051626 100%)`,
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
      set({ wallpaper: 'custom', customImageUrl: dataUrl })
      persist({ wallpaper: 'custom' }) 
      // Do not store the heavy dataURL in localstorage
      try {
        await updateWallpaper(dataUrl)
      } catch (err) {
         console.error('Failed to sync wallpaper', err)
      }
    },

    syncCustomImage: async () => {
      try {
        const res = await getWallpaper()
        if (res && res.data) {
           set({ customImageUrl: res.data, wallpaper: 'custom' })
           persist({ wallpaper: 'custom' })
        }
      } catch (err) {
        // ignore
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
