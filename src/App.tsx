import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { GlobalAlert } from '@/components/alert/GlobalAlert'
import { AppShell } from '@/shell'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <GlobalAlert />
        <Toaster theme="dark" position="top-center" richColors />
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
