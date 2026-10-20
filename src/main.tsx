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

registerServiceWorker()

// The static splash from index.html stays until React has painted its first frame
function dismissBootSplash() {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  splash.style.transition = 'opacity 160ms ease'
  splash.style.opacity = '0'
  window.setTimeout(() => splash.remove(), 200)
}

// The stylesheet of the app loads beside the page (see vite.config.ts); the first frame of the app waits for it
function stylesReady() {
  const link = document.querySelector<HTMLLinkElement>('link[data-app-css]')
  if (!link || link.sheet) return Promise.resolve()
  return new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => resolve(), { once: true })
  })
}

// The text of the chosen language, the stylesheet and the code of the page are in before the first frame, so nothing shows keys
// or an empty page while they load
void Promise.all([loadLanguage(getInitialLanguage()), stylesReady(), preloadRoute(window.location.pathname).catch(() => undefined)]).then(() => {
  seedFromBoot()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  )
  window.requestAnimationFrame(() => window.requestAnimationFrame(dismissBootSplash))
})
