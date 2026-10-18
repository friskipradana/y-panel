import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { GlobalAlert } from '@/components/alert/GlobalAlert'
import { AppShell } from '@/shell'
import { queryClient } from '@/lib/queryClient'

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
