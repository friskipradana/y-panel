import { Desktop } from '@/components/desktop/Desktop'
import { useAuthStore } from '@/store/authStore'

export interface DesktopPageProps {
  onLogout: () => void
  authenticated?: boolean
}

export function DesktopPage({ onLogout, authenticated: authProp }: DesktopPageProps) {
  const storeAuthenticated = useAuthStore((s) => s.authenticated)
  const authenticated = authProp ?? storeAuthenticated
  return <Desktop onLogout={onLogout} authenticated={authenticated} />
}

export { DesktopPage as HomePage }
