import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>
}

const LAZY_RELOAD_KEY = 'reneo-lazy-chunk-reload'

function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message || err || '').toLowerCase()
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('failed to fetch')
  )
}

async function loadWithChunkRecovery<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch (firstErr) {
    if (!isChunkLoadError(firstErr)) throw firstErr
    // Brief retry in case the server just finished restarting after an update
    await new Promise((resolve) => window.setTimeout(resolve, 450))
    try {
      return await loader()
    } catch (secondErr) {
      if (isChunkLoadError(secondErr)) {
        try {
          const marker = `${window.location.pathname}${window.location.search}`
          if (window.sessionStorage.getItem(LAZY_RELOAD_KEY) !== marker) {
            window.sessionStorage.setItem(LAZY_RELOAD_KEY, marker)
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
            return await new Promise<T>(() => undefined)
          }
        } catch {
          // fall through and surface original error
        }
      }
      throw secondErr
    }
  }
}

/**
 * Clean helper to lazy-load named exports with preloading capability.
 * Example: const DockerWindow = lazyNamed(() => import('./DockerWindow'), 'DockerWindow')
 */
export function lazyNamed<T extends Record<string, any>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
): PreloadableComponent<T[K]> {
  let loadedModule: { default: T[K] } | null = null

  const load = () => {
    if (loadedModule) return Promise.resolve(loadedModule)
    return loadWithChunkRecovery(loader).then((module) => {
      loadedModule = { default: module[name] }
      return loadedModule
    })
  }

  const Component = lazy(load) as PreloadableComponent<T[K]>
  Component.preload = load
  return Component
}

/**
 * Clean helper to lazy-load default exports with preloading capability.
 * Example: const DocsWindow = lazyDefault(() => import('./DocsWindow'))
 */
export function lazyDefault<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): PreloadableComponent<T> {
  let loadedModule: { default: T } | null = null

  const load = () => {
    if (loadedModule) return Promise.resolve(loadedModule)
    return loadWithChunkRecovery(loader).then((module) => {
      loadedModule = module
      return loadedModule
    })
  }

  const Component = lazy(load) as PreloadableComponent<T>
  Component.preload = load
  return Component
}
