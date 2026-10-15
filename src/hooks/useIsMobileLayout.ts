import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'
const STORAGE_KEY = 'reneo-ui-mode'

type UiMode = 'mobile' | 'desktop' | null

// ?ui=mobile or ?ui=desktop pins the layout; without it the screen width decides
function readOverride(): UiMode {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ui')
    if (fromUrl === 'mobile' || fromUrl === 'desktop') {
      window.localStorage.setItem(STORAGE_KEY, fromUrl)
      return fromUrl
    }
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'mobile' || stored === 'desktop' ? stored : null
  } catch {
    return null
  }
}

export function setUiMode(mode: Exclude<UiMode, null> | 'auto') {
  try {
    if (mode === 'auto') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // storage unavailable: the choice only lasts until reload
  }
  window.dispatchEvent(new Event('reneo:ui-mode'))
}

// True on phones and narrow windows, where the floating-window desktop is not usable
export function useIsMobileLayout(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(QUERY).matches)
  const [override, setOverride] = useState<UiMode>(readOverride)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onMedia = () => setNarrow(media.matches)
    const onMode = () => setOverride(readOverride())
    media.addEventListener('change', onMedia)
    window.addEventListener('reneo:ui-mode', onMode)
    return () => {
      media.removeEventListener('change', onMedia)
      window.removeEventListener('reneo:ui-mode', onMode)
    }
  }, [])

  if (override === 'mobile') return true
  if (override === 'desktop') return false
  return narrow
}
