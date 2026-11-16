import '@/lib/legacyStorage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/assets/css/tailwind.css'
import '@/assets/scss/global.scss'
import App from './App'
import { registerServiceWorker } from './pwa'
import { I18nProvider, getInitialLanguage, loadLanguage } from '@/lib/i18n'
import { seedFromBoot } from '@/lib/bootData'
import { preloadRoute } from '@/router'

declare global {
  interface Window {
    __REN_BOOT_STARTED__?: boolean
  }
}

window.__REN_BOOT_STARTED__ = true

const CHUNK_RELOAD_KEY = 'reneo-chunk-reload'

function tryRecoverStaleChunks(): boolean {
  try {
    const marker = `${window.location.pathname}${window.location.search}`
    if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === marker) {
      return false
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, marker)
    const cacheStorage = globalThis.caches
    if (cacheStorage) {
      void cacheStorage
        .keys()
        .then((names) => Promise.all(names.map((name) => cacheStorage.delete(name))))
        .catch(() => undefined)
        .finally(() => window.location.reload())
    } else {
      window.location.reload()
    }
    return true
  } catch {
    return false
  }
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  tryRecoverStaleChunks()
})

registerServiceWorker()

// The static splash from index.html stays until React has painted its first frame
function dismissBootSplash() {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  splash.style.transition = 'opacity 160ms ease'
  splash.style.opacity = '0'
  window.setTimeout(() => splash.remove(), 200)
}

function settleLinkStylesheet(link: HTMLLinkElement): Promise<void> {
  const ready = link.dataset.cssState
  if (link.sheet || ready === 'loaded' || ready === 'error') {
    if (link.media !== 'all') link.media = 'all'
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      if (link.media !== 'all') link.media = 'all'
      window.clearTimeout(timer)
      resolve()
    }
    // Safety timeout prevents #boot-splash from hanging forever if onload/onerror fired before main.tsx ran or CSS stalled
    const timer = window.setTimeout(finish, 2500)
    link.addEventListener('load', finish, { once: true })
    link.addEventListener('error', finish, { once: true })
  })
}

// The stylesheet of the app loads beside the page (see vite.config.ts); the first frame of the app waits for it cleanly
function stylesReady(): Promise<void> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-app-css]'))
  if (links.length === 0) return Promise.resolve()
  return Promise.all(links.map(settleLinkStylesheet)).then(() => undefined)
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        resolve(fallback)
      }
    }, ms)
    promise.then(
      (value) => {
        if (!settled) {
          settled = true
          window.clearTimeout(timer)
          resolve(value)
        }
      },
      () => {
        if (!settled) {
          settled = true
          window.clearTimeout(timer)
          resolve(fallback)
        }
      },
    )
  })
}

async function boot() {
  try {
    await Promise.all([
      withTimeout(
        loadLanguage(getInitialLanguage()).catch(() => {
          tryRecoverStaleChunks()
        }),
        5000,
        undefined,
      ),
      stylesReady(),
      withTimeout(preloadRoute(window.location.pathname).catch(() => undefined), 5000, undefined),
    ])
  } finally {
    seedFromBoot()
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <I18nProvider>
          <App />
        </I18nProvider>
      </StrictMode>,
    )
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      window.sessionStorage.removeItem('reneo-boot-recover')
    } catch {
      // ignore storage access issues
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(dismissBootSplash))
    // Fallback removal in case rAF is paused (e.g. background tab)
    window.setTimeout(dismissBootSplash, 300)
  }
}

void boot()
