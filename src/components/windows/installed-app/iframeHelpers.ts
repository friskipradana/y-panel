export const APP_URL_STORAGE_PREFIX = 'reneo:app-last-url:'
export const APP_AUTOHIDE_PREFIX = 'reneo:app-autohide:'
export const IFRAME_ALLOW_POLICY =
  'autoplay; fullscreen; picture-in-picture; clipboard-read; clipboard-write; microphone; camera; display-capture; encrypted-media; speaker-selection; gamepad'

export function getSavedAppUrl(appId: number, baseOpenUrl: string): string {
  try {
    const saved = window.localStorage.getItem(`${APP_URL_STORAGE_PREFIX}${appId}`)
    if (!saved) return baseOpenUrl
    const base = new URL(baseOpenUrl, window.location.origin)
    const target = new URL(saved, window.location.origin)
    if (target.origin !== base.origin) return baseOpenUrl
    if (!target.pathname.startsWith(base.pathname.replace(/\/$/, ''))) return baseOpenUrl
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return baseOpenUrl
  }
}

export function saveAppUrl(appId: number, baseOpenUrl: string, currentHref: string) {
  try {
    const base = new URL(baseOpenUrl, window.location.origin)
    const target = new URL(currentHref, window.location.origin)
    if (target.origin !== base.origin) return
    if (!target.pathname.startsWith(base.pathname.replace(/\/$/, ''))) return
    window.localStorage.setItem(`${APP_URL_STORAGE_PREFIX}${appId}`, `${target.pathname}${target.search}${target.hash}`)
  } catch {
    // Cross-origin iframes cannot be read from the parent frame
  }
}

export function readAutoHide(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(`${APP_AUTOHIDE_PREFIX}${storageKey}`) === '1'
  } catch {
    return false
  }
}

export function writeAutoHide(storageKey: string, value: boolean) {
  try {
    window.localStorage.setItem(`${APP_AUTOHIDE_PREFIX}${storageKey}`, value ? '1' : '0')
  } catch {
    // Ignore storage errors
  }
}

export function detectIframeContentSize(iframe: HTMLIFrameElement | null): { width: number; height: number; ratio: number } | null {
  try {
    const doc = iframe?.contentDocument
    if (!doc) return null

    // Prefer remote desktop / video / canvas element dimensions (Selkies, KasmVNC, Jellyfin, YouTube)
    const videos = Array.from(doc.querySelectorAll('video'))
    for (const v of videos) {
      if (v.videoWidth >= 320 && v.videoHeight >= 180) {
        return { width: v.videoWidth, height: v.videoHeight, ratio: v.videoWidth / v.videoHeight }
      }
    }
    const canvases = Array.from(doc.querySelectorAll('canvas'))
    let bestCanvas: HTMLCanvasElement | null = null
    for (const c of canvases) {
      const area = c.width * c.height
      if (area >= 320 * 180 && (!bestCanvas || area > bestCanvas.width * bestCanvas.height)) {
        bestCanvas = c
      }
    }
    if (bestCanvas) {
      return { width: bestCanvas.width, height: bestCanvas.height, ratio: bestCanvas.width / bestCanvas.height }
    }

    const root = doc.documentElement
    const body = doc.body
    const sw = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0)
    const sh = Math.max(root?.scrollHeight || 0, body?.scrollHeight || 0)
    if (sw >= 360 && sh >= 240) {
      return { width: sw, height: sh, ratio: sw / sh }
    }
  } catch {
    // Cross-origin frame
  }
  return null
}

export function nudgeIframeResize(iframe: HTMLIFrameElement | null) {
  try {
    iframe?.contentWindow?.dispatchEvent(new Event('resize'))
  } catch {
    // Cross-origin frame
  }
}
