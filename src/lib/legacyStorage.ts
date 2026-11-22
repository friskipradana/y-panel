// Browser storage keys used before the rename to Reneo. Copied once, before any store reads them.
const RENAMED_KEYS: Record<string, string> = {
  'ypanel-language': 'reneo-language',
  'ypanel-widget-network-active-tab': 'reneo-widget-network-active-tab',
  'ypanel-widgets-owner': 'reneo-widgets-owner',
  'ypanel-metrics-v1': 'reneo-metrics-v1',
  'ypanel-desktop-widgets-v2': 'reneo-desktop-widgets-v2',
  'ui-panel-theme': 'reneo-theme',
  'ui-panel-windows': 'reneo-windows',
}

try {
  for (const [oldKey, newKey] of Object.entries(RENAMED_KEYS)) {
    const value = window.localStorage.getItem(oldKey)
    if (value === null) continue
    if (window.localStorage.getItem(newKey) === null) window.localStorage.setItem(newKey, value)
    window.localStorage.removeItem(oldKey)
  }
} catch {
  // storage can be blocked; every key then simply starts empty
}
