import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'
const LEGACY_STORAGE_KEY = 'reneo-ui-mode'

type UiMode = 'mobile' | 'desktop' | null

// ?ui=mobile or ?ui=desktop pins the layout for this page load only: it lives in memory,
// so a reload without the parameter returns to the automatic choice
let override: UiMode = (() => {
  try {
    // an earlier version persisted the choice; drop it so nobody stays stuck on it
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    const fromUrl = new URLSearchParams(window.location.search).get('ui')
    return fromUrl === 'mobile' || fromUrl === 'desktop' ? fromUrl : null
  } catch {
    return null
  }
})()

export function setUiMode(mode: Exclude<UiMode, null> | 'auto') {
  override = mode === 'auto' ? null : mode
  window.dispatchEvent(new Event('reneo:ui-mode'))
}

// Non-hook form for stores: true while the phone layout is the one on screen
export function isMobileLayoutNow(): boolean {
  if (override) return override === 'mobile'
  return window.matchMedia(QUERY).matches
}

// True on phones and narrow windows, where the floating-window desktop is not usable
export function useIsMobileLayout(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(QUERY).matches)
  const [mode, setMode] = useState<UiMode>(override)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onMedia = () => setNarrow(media.matches)
    const onMode = () => setMode(override)
    media.addEventListener('change', onMedia)
    window.addEventListener('reneo:ui-mode', onMode)
    return () => {
      media.removeEventListener('change', onMedia)
      window.removeEventListener('reneo:ui-mode', onMode)
    }
  }, [])

  if (mode === 'mobile') return true
  if (mode === 'desktop') return false
  return narrow
}
