import { useQuery } from '@tanstack/react-query'
import { getFrontendRevision } from '@/api/auth'

// Version baked into this frontend bundle (package.json at build time)
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

export const RELEASES_URL = 'https://github.com/friskipradana/y-panel/releases'

export function releaseUrl(version: string) {
  return /^\d+\.\d+\.\d+/.test(version) ? `${RELEASES_URL}/tag/v${version}` : RELEASES_URL
}

// Prefers the version the running agent reports (what is really installed),
// falling back to the bundle version while loading or when the agent is older.
export function usePanelVersion() {
  const { data } = useQuery({
    queryKey: ['panel', 'version'],
    queryFn: getFrontendRevision,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const server = data?.version?.replace(/^v/, '').trim() || ''
  return { version: server || APP_VERSION, serverVersion: server || null, bundleVersion: APP_VERSION }
}
