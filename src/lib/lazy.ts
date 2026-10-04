import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>
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
    return loader().then((module) => {
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
    return loader().then((module) => {
      loadedModule = module
      return loadedModule
    })
  }

  const Component = lazy(load) as PreloadableComponent<T>
  Component.preload = load
  return Component
}
