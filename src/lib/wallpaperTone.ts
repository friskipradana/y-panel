import { useEffect, useState } from 'react'
import { useThemeStore, WALLPAPERS } from '@/store/themeStore'

export type WallpaperTone = 'light' | 'dark'

// The icons sit along the left edge: that strip of the picture is what their labels are read against
const STRIP = 0.3
const DARK_BELOW = 0.5

const measured = new Map<string, WallpaperTone>()

// How light the left strip of a picture is, from a small copy of it: relative luminance of the average colour
function measureTone(url: string): Promise<WallpaperTone> {
  const known = measured.get(url)
  if (known) return Promise.resolve(known)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const width = 48
        const height = Math.max(8, Math.round((width * image.naturalHeight) / Math.max(1, image.naturalWidth)))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('no canvas')
        ctx.drawImage(image, 0, 0, width, height)
        const data = ctx.getImageData(0, 0, Math.round(width * STRIP), height).data
        let sum = 0
        const pixels = data.length / 4
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        }
        const tone: WallpaperTone = sum / pixels / 255 < DARK_BELOW ? 'dark' : 'light'
        measured.set(url, tone)
        resolve(tone)
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error('the wallpaper could not be read'))
    image.src = url
  })
}

// Whether the desktop behind the icons is light or dark. It follows the picture, not the mode of the panel: a dark picture
// in light mode still needs light labels. A gradient follows the mode, except the one that is dark in both.
export function useWallpaperTone(): WallpaperTone {
  const mode = useThemeStore((s) => s.mode)
  const wallpaper = useThemeStore((s) => s.wallpaper)
  const customImageUrl = useThemeStore((s) => s.customImageUrl)
  const preset = wallpaper === 'custom' ? null : WALLPAPERS[wallpaper]
  const url = wallpaper === 'custom' ? customImageUrl : preset?.type === 'image' ? preset.light : null
  const [tone, setTone] = useState<WallpaperTone | null>(url ? (measured.get(url) ?? null) : null)

  useEffect(() => {
    if (!url) {
      setTone(null)
      return
    }
    let alive = true
    measureTone(url)
      .then((value) => alive && setTone(value))
      .catch(() => alive && setTone(null))
    return () => {
      alive = false
    }
  }, [url])

  if (url) return tone ?? mode
  if (wallpaper === 'midnight') return 'dark'
  return mode
}
