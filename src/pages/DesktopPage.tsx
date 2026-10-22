import { Desktop } from '@/components/desktop/Desktop'
import { PlanExpiryNotice } from '@/components/system/PlanExpiryNotice'
import { useAuthStore } from '@/store/authStore'
import { usePageMeta } from '@/hooks/usePageMeta'

export interface DesktopPageProps {
  onLogout: () => void
  authenticated?: boolean
}

export function DesktopPage({ onLogout, authenticated: authProp }: DesktopPageProps) {
  usePageMeta('Reneo Panel')
  const storeAuthenticated = useAuthStore((s) => s.authenticated)
  const authenticated = authProp ?? storeAuthenticated
  return (
    <>
      <Desktop onLogout={onLogout} authenticated={authenticated} />
      <PlanExpiryNotice />
    </>
  )
}

export { DesktopPage as HomePage }
