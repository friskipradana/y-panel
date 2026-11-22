import { Toaster as SonnerToaster } from 'sonner'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'

export function AppToaster() {
  const mode = useThemeStore((s) => s.mode)

  return (
    <SonnerToaster
      theme={mode}
      position="top-center"
      offset={52}
      closeButton={false}
      duration={2800}
      visibleToasts={3}
      gap={6}
      richColors
      icons={{
        success: <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />,
        error: <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />,
        warning: <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />,
        info: <Info className="h-4 w-4 shrink-0" strokeWidth={1.75} />,
        loading: <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.75} />,
      }}
    />
  )
}
