import { queryClient } from '@/lib/queryClient'

declare global {
  interface Window {
    __REN_BOOT__?: Partial<Record<'site' | 'demo' | 'hosting' | 'revision', unknown>>
  }
}

// What the agent already put into the page for the public pages, under the query keys the pages ask with, so they
// show at once instead of waiting on a request each
const KEYS: Record<string, readonly string[]> = {
  site: ['public-site'],
  demo: ['public-demo'],
  hosting: ['public-hosting'],
  revision: ['panel', 'version'],
}

export function seedFromBoot() {
  const boot = window.__REN_BOOT__
  if (!boot) return
  for (const [name, key] of Object.entries(KEYS)) {
    const data = boot[name as keyof typeof boot]
    if (data !== undefined) queryClient.setQueryData(key, data)
  }
  delete window.__REN_BOOT__
}
