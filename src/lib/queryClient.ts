import { QueryClient } from '@tanstack/react-query'

// One client for the app; the live socket writes pushed data into it
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
})
