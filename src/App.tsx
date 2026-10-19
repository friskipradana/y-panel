import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { GlobalAlert } from '@/components/alert/GlobalAlert'
import { AppToaster } from '@/components/alert/AppToaster'
import { AppShell } from '@/shell'
import { queryClient } from '@/lib/queryClient'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <GlobalAlert />
        <AppToaster />
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
