import { useState } from "react";
import {
  Clock,
  Cloud,
  CreditCard,
  Database,
  Globe2,
  ImagePlus,
  Key,
  Lock,
  LockKeyhole,
  Monitor,
  Palette,
  Server,
  Smartphone,
  Volume2,
} from "lucide-react";
import { ApiTokensTab } from "@/components/windows/settings/ApiTokensTab";
import { useI18n } from "@/lib/i18n";
import { useHostSettings } from "./settings/hooks/useHostSettings";
import { useCloudflareSettings } from "./settings/hooks/useCloudflareSettings";
import { usePaymentSettings } from "./settings/hooks/usePaymentSettings";
import { useNotificationSettings } from "./settings/hooks/useNotificationSettings";
import type { SettingsTabKey } from "./settings/constants";
import { GeneralTab } from "./settings/tabs/GeneralTab";
import { AppearanceTab } from "./settings/tabs/AppearanceTab";
import { WallpaperTab } from "./settings/tabs/WallpaperTab";
import { DesktopTab } from "./settings/tabs/DesktopTab";
import { ScreensaverTab } from "./settings/tabs/ScreensaverTab";
import { SoundTab } from "./settings/tabs/SoundTab";
import { CloudflareTab } from "./settings/tabs/CloudflareTab";
import { NetworkTab } from "./settings/tabs/NetworkTab";
import { SecurityTab } from "./settings/tabs/SecurityTab";
import { PaymentTab } from "./settings/tabs/PaymentTab";
import { NotificationsTab } from "./settings/tabs/NotificationsTab";
import { AuditTab } from "./settings/tabs/AuditTab";
import { LoadingState } from "@/components/ui/states"

export function SettingsWindow({ authenticated }: { authenticated?: boolean }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("general");

  const host = useHostSettings({ authenticated });
  const cloudflare = useCloudflareSettings();
  const payment = usePaymentSettings({ authenticated });
  const listener = useNotificationSettings({ authenticated });

  const SETTINGS_TABS: {
    key: SettingsTabKey;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    {
      key: "general",
      label: t("settings.tabs.general"),
      icon: Server,
    },
    { key: "appearance", label: t("settings.tabs.appearance"), icon: Palette },
    { key: "wallpaper", label: t("settings.tabs.wallpaper"), icon: ImagePlus },
    { key: "desktop", label: t("settings.tabs.desktop"), icon: Monitor },
    { key: "screensaver", label: t("settings.tabs.screensaver"), icon: Lock },
    { key: "sound", label: t("settings.tabs.sound"), icon: Volume2 },
    { key: "cloudflare", label: t("settings.tabs.cloudflare"), icon: Cloud },
    {
      key: "network",
      label: t("settings.tabs.network"),
      icon: Globe2,
    },
    {
      key: "security",
      label: t("settings.tabs.security"),
      icon: LockKeyhole,
    },
    {
      key: "api_tokens",
      label: t("settings.tabs.apiTokens"),
      icon: Key,
    },
    {
      key: "payment",
      label: t("settings.tabs.payment"),
      icon: CreditCard,
    },
    {
      key: "notifications",
      label: t("settings.tabs.notifications"),
      icon: Smartphone,
    },
    {
      key: "audit",
      label: t("settings.tabs.audit"),
      icon: Clock,
    },
  ];

  return (
    <div className="@container panel-window flex flex-col h-full overflow-hidden">
      {/* ── Window Body: Desktop UI Sidebar + Content Area ── */}
      <div className="panel-window__body flex-1 min-h-0 flex flex-row overflow-hidden p-0 @max-xl:flex-col">
        {/* ── Left Sidebar Navigation (Matching Applications Drawer Style) ── */}
        <div className="w-[180px] lg:w-[190px] shrink-0 border-r border-[var(--win-border)] bg-[var(--panel-surface)] p-2 flex flex-col gap-0.5 overflow-y-auto select-none @max-xl:w-full @max-xl:flex-row @max-xl:gap-1 @max-xl:overflow-x-auto @max-xl:overflow-y-hidden @max-xl:border-b @max-xl:border-r-0">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-80 @max-xl:hidden">
            {t("settings.title")}
          </div>
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 w-full @max-xl:w-auto @max-xl:shrink-0 @max-xl:whitespace-nowrap px-2.5 py-1.5 rounded-lg text-left text-[11.5px] font-medium border transition-colors duration-150 cursor-pointer outline-none focus:outline-none ${
                  isActive
                    ? "bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-semibold border-[var(--panel-primary-text)]/25 shadow-xs"
                    : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]"
                }`}
              >
                <Icon
                  size={14}
                  className={isActive ? "text-[var(--panel-primary-text)]" : "text-[var(--text-secondary)] opacity-70"}
                />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Right Content Area ── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-3.5 md:p-4">
          {host.query.isLoading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              <LoadingState>{t("settings.loadingHostSettings")}</LoadingState>
            </div>
          )}

          {!host.query.isLoading && (host.query.isError || !host.query.data) && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              <div className="panel-error-state">
                <Database className="h-5 w-5" />
                <div>
                  <p className="font-semibold">
                    {t("settings.hostLoadFailed")}
                  </p>
                  <p className="mt-1 text-[12px] leading-6 opacity-90">
                    {t("settings.hostLoadFailedHint")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!host.query.isLoading && host.query.data && (
            <>
              {activeTab === "general" && <GeneralTab host={host} systemSettings={host.query.data} />}

              {activeTab === "appearance" && <AppearanceTab />}

              {activeTab === "wallpaper" && <WallpaperTab />}

              {activeTab === "desktop" && <DesktopTab />}

              {activeTab === "screensaver" && <ScreensaverTab />}

              {activeTab === "sound" && <SoundTab />}

              {activeTab === "cloudflare" && <CloudflareTab cloudflare={cloudflare} />}

              {activeTab === "network" && <NetworkTab host={host} systemSettings={host.query.data} />}

              {activeTab === "security" && <SecurityTab host={host} setActiveTab={setActiveTab} />}

              {activeTab === "payment" && <PaymentTab payment={payment} />}

              {activeTab === "notifications" && <NotificationsTab listener={listener} setActiveTab={setActiveTab} />}

              {activeTab === "audit" && <AuditTab host={host} />}

              {activeTab === "api_tokens" && <ApiTokensTab />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
