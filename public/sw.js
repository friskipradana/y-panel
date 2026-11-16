const CACHE_VERSION = 'reneo-pwa-v4'
const APP_SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-maskable.svg',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
]

const API_PREFIXES = ['/api', '/agent', '/portainer', '/app']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const requestUrl = new URL(request.url)

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return
  if (API_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix))) return
  if (requestUrl.pathname === '/sw.js') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const contentType = response.headers.get('content-type') || ''
          if (response.ok && response.type === 'basic' && contentType.includes('text/html')) {
            const copy = response.clone()
            void caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match('/index.html')
          return cached || Response.error()
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse

      return fetch(request).then((networkResponse) => {
        if (!networkResponse) return networkResponse

        if (networkResponse.status === 404 && requestUrl.pathname.startsWith('/assets/')) {
          void caches.open(CACHE_VERSION).then((cache) => cache.delete('/index.html'))
        }

        if (networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse
        }

        const contentType = networkResponse.headers.get('content-type') || ''
        if (requestUrl.pathname.startsWith('/assets/') && contentType.includes('text/html')) {
          return networkResponse
        }

        const copy = networkResponse.clone()
        void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
        return networkResponse
      })
    }),
  )
})
