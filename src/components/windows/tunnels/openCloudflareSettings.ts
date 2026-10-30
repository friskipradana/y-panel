import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'

// The API token of Cloudflare is set in Settings > Cloudflare, by every account (not only the superadmin): open Settings on that tab
export function openCloudflareSettings() {
  useSettingsNavStore.getState().request('cloudflare')
  useWindowStore.getState().openWindow('settings')
}
