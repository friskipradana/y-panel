// Settings Window Constants

export const TIMEZONES = [
  "UTC",
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Asia/Yangon",
  "Asia/Ho_Chi_Minh",
  "Asia/Manila",
  "Asia/Taipei",
  "Asia/Ulaanbaatar",
  "Asia/Almaty",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Mexico_City",
  "America/Buenos_Aires",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

export const PRESET_DNS = [
  { label: "Cloudflare", value: "1.1.1.1", tone: "panel-badge--warning" },
  { label: "1.0.0.1", value: "1.0.0.1", tone: "panel-badge--warning" },
  { label: "Google", value: "8.8.8.8", tone: "panel-badge--success" },
  { label: "8.8.4.4", value: "8.8.4.4", tone: "panel-badge--success" },
  { label: "Quad9", value: "9.9.9.9", tone: "panel-badge--info" },
  { label: "OpenDNS", value: "208.67.222.222", tone: "panel-badge--neutral" },
];

export type SettingsTabKey =
  | "general"
  | "hosting"
  | "appearance"
  | "wallpaper"
  | "desktop"
  | "screensaver"
  | "sound"
  | "cloudflare"
  | "network"
  | "security"
  | "payment"
  | "notifications"
  | "audit"
  | "api_tokens"
  | "reneo_database"
  | "reneo_runtime";

// The tabs an account may open: the superadmin all of them, everyone else only their own area
// (host settings, payment, audit, the panel's database and the hosting tab stay with the superadmin)
const OWN_TABS: SettingsTabKey[] = ["appearance", "wallpaper", "desktop", "screensaver", "sound", "cloudflare", "security", "api_tokens"];

export function settingsTabAllowed(key: SettingsTabKey, role?: string | null): boolean {
  if (role === "superadmin") return true;
  if (key === "notifications") return role === "admin";
  return OWN_TABS.includes(key);
}

// i18n key of the title of a tab
export const SETTINGS_TAB_TITLE: Record<SettingsTabKey, string> = {
  general: "settings.tabs.general",
  hosting: "settings.tabs.hosting",
  appearance: "settings.tabs.appearance",
  wallpaper: "settings.tabs.wallpaper",
  desktop: "settings.tabs.desktop",
  screensaver: "settings.tabs.screensaver",
  sound: "settings.tabs.sound",
  cloudflare: "settings.tabs.cloudflare",
  network: "settings.tabs.network",
  security: "settings.tabs.security",
  payment: "settings.tabs.payment",
  notifications: "settings.tabs.notifications",
  audit: "settings.tabs.audit",
  api_tokens: "settings.tabs.apiTokens",
  reneo_database: "settings.tabs.reneoDatabase",
  reneo_runtime: "settings.tabs.reneoRuntime",
};
