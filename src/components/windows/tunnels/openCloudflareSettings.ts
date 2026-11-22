import { canAccessWindow } from '@/components/desktop/windowRegistry'
import { useAuthStore } from '@/store/authStore'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'

// The API token of Cloudflare is set in Settings > Cloudflare, by every account (not only the superadmin): open Settings on that tab
export function openCloudflareSettings() {
  useSettingsNavStore.getState().request('cloudflare')
  useWindowStore.getState().openWindow('settings')
}

// The demo account only looks: it has no Settings window, so there is nowhere to send it to
export function useCanOpenCloudflareSettings(): boolean {
  const role = useAuthStore((s) => s.user?.role)
  return canAccessWindow('settings', role)
}
