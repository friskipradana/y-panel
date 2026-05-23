/**
 * Barrel re-export — backward compatibility layer.
 *
 * All domain API functions have been decomposed into dedicated modules:
 *   ./client       – axios instance, interceptors, shared helpers
 *   ./auth         – authentication, session, setup
 *   ./system       – system summary, logs, settings, database, wallpaper
 *   ./terminal     – terminal sessions & presets
 *   ./docker       – containers, images, networks, templates
 *   ./users        – user CRUD & quotas
 *   ./cloudflare   – CF config, domains, DNS, tunnel profiles
 *   ./projects     – project CRUD & lifecycle
 *   ./tunnels      – tunnel CRUD
 *   ./docs         – documentation CRUD
 *   ./notifications – notifications & WebSocket
 *   ./files        – file root access
 *   ./payment      – payment gateway settings, notification devices, webhooks
 *
 * Consumers can import from `@/api/agent` (legacy) or directly from the
 * domain module (preferred for new code).
 */

// Re-export every domain module so `import { X } from '@/api/agent'` keeps working.
export * from './client'
export * from './auth'
export * from './system'
export * from './terminal'
export * from './docker'
export * from './users'
export * from './cloudflare'
export * from './projects'
export * from './tunnels'
export * from './docs'
export * from './notifications'
export * from './files'
export * from './payment'
