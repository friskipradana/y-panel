import { useQuery } from '@tanstack/react-query'
import { getPublicSite } from '@/api/system'

// Which public pages exist. While it loads the pages are assumed to exist: the agent already
// refuses the ones that do not, this only keeps links and redirects in step.
export function usePublicSite() {
  const query = useQuery({ queryKey: ['public-site'], queryFn: getPublicSite, staleTime: 60_000, retry: 0 })
  return { landing: query.data?.landing ?? true, hosting: query.data?.hosting ?? false, loaded: query.isSuccess }
}
