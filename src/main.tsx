import '@/lib/legacyStorage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/assets/css/tailwind.css'
import '@/assets/scss/global.scss'
import App from './App'
import { registerServiceWorker } from './pwa'
import { I18nProvider } from '@/lib/i18n'

registerServiceWorker()

// The static splash from index.html stays until React has painted its first frame
function dismissBootSplash() {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  splash.style.transition = 'opacity 160ms ease'
  splash.style.opacity = '0'
  window.setTimeout(() => splash.remove(), 200)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
window.requestAnimationFrame(() => window.requestAnimationFrame(dismissBootSplash))
