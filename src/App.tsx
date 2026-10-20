import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { lazyNamed } from '@/lib/lazy'
import { useAlertStore } from '@/store/alertStore'
import { AppToaster } from '@/components/alert/AppToaster'
import { AppShell } from '@/shell'
import { queryClient } from '@/lib/queryClient'

const GlobalAlert = lazyNamed(() => import('@/components/alert/GlobalAlert'), 'GlobalAlert')

// The dialog and its animation code are fetched the first time something asks for a dialog
function AlertHost() {
  const open = useAlertStore((s) => s.isOpen)
  const [used, setUsed] = useState(open)
  if (open && !used) setUsed(true)
  return used ? (
    <Suspense fallback={null}>
      <GlobalAlert />
    </Suspense>
  ) : null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AlertHost />
        <AppToaster />
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
