import { useEffect, useState } from "react";

import { ApiTokensTab } from "@/components/windows/settings/ApiTokensTab";
import { useI18n } from "@/lib/i18n";
import { useHostSettings } from "./settings/hooks/useHostSettings";
import { useCloudflareSettings } from "./settings/hooks/useCloudflareSettings";
import { usePaymentSettings } from "./settings/hooks/usePaymentSettings";
import { useNotificationSettings } from "./settings/hooks/useNotificationSettings";
import { settingsTabAllowed, type SettingsTabKey } from "./settings/constants";
import { SETTINGS_GROUPS } from "./settings/tabsConfig";
import { SettingsNav } from "./settings/SettingsNav";
import { GeneralTab } from "./settings/tabs/GeneralTab";
import { HostingTab } from "./settings/tabs/HostingTab";
import { AppearanceTab } from "./settings/tabs/AppearanceTab";
import { WallpaperTab } from "./settings/tabs/WallpaperTab";
import { DesktopTab } from "./settings/tabs/DesktopTab";
import { ScreensaverTab } from "./settings/tabs/ScreensaverTab";
import { SoundTab } from "./settings/tabs/SoundTab";
import { CloudflareTab } from "./settings/tabs/CloudflareTab";
import { NetworkTab } from "./settings/tabs/NetworkTab";
import { SecurityTab } from "./settings/tabs/SecurityTab";
import { PaymentTab } from "./settings/tabs/PaymentTab";
import { AuditTab } from "./settings/tabs/AuditTab";
import { ReneoDatabaseTab } from "./settings/tabs/ReneoDatabaseTab";
import { ReneoRuntimeTab } from "./settings/tabs/ReneoRuntimeTab";
import { useAuthStore } from "@/store/authStore";
import { useSettingsNavStore } from "@/store/settingsNavStore";
import { AccountSecurityCard } from "./profile/AccountSecurityCard";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/states"
import { Database, RefreshCw } from "lucide-react";

export function SettingsWindow({ authenticated }: { authenticated?: boolean }) {
  const { t } = useI18n();
  const isSuperadmin = useAuthStore((s) => s.user?.role) === "superadmin";
  const role = useAuthStore((s) => s.user?.role);
  // host settings (hostname, DNS, ports, updates, payment, audit) belong to the superadmin
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(role === "superadmin" ? "general" : "appearance");

  const host = useHostSettings({ authenticated });
  const cloudflare = useCloudflareSettings();
  const payment = usePaymentSettings({ authenticated });
  const listener = useNotificationSettings({ authenticated });

  // the menu as this account sees it: groups of tabs, without what it may not open
  const groups = SETTINGS_GROUPS.map((group) => ({ ...group, tabs: group.tabs.filter((tab) => settingsTabAllowed(tab.key, role)) })).filter((group) => group.tabs.length > 0);
  const SETTINGS_TABS = groups.flatMap((group) => group.tabs);
  // the quick search can ask for a tab; take it when the account may see it
  const requestedTab = useSettingsNavStore((s) => s.tab);
  const clearRequestedTab = useSettingsNavStore((s) => s.clear);
  useEffect(() => {
    if (!requestedTab) return;
    if (settingsTabAllowed(requestedTab, role)) setActiveTab(requestedTab);
    clearRequestedTab();
  }, [requestedTab, role, clearRequestedTab]);
  // the role can arrive after the first render: never sit on a tab the account cannot see
  const shownTab = SETTINGS_TABS.some((tab) => tab.key === activeTab) ? activeTab : SETTINGS_TABS[0]?.key;

  const current = SETTINGS_TABS.find((tab) => tab.key === shownTab);
  const CurrentIcon = current?.icon;

  return (
    <div className="panel-window flex flex-col h-full overflow-hidden">
      <div className="panel-window__body flex-1 min-h-0 flex flex-row overflow-hidden p-0 mobile:flex-col">
        <SettingsNav title={isSuperadmin ? t("settings.title") : t("settings.titleAccount")} groups={groups} active={shownTab} onSelect={setActiveTab} />

        {/* ── Right Content Area ── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-3.5 md:p-4 flex flex-col">
          {current && CurrentIcon ? (
            <header className="settings-page__head shrink-0">
              <CurrentIcon size={16} className="settings-page__icon" />
              <div className="min-w-0">
                <h1 className="settings-page__title">{t(current.label)}</h1>
                <p className="settings-page__desc">{t(current.desc)}</p>
              </div>
            </header>
          ) : null}
          {isSuperadmin && host.query.isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[280px] my-auto">
              <LoadingState>{t("settings.loadingHostSettings")}</LoadingState>
            </div>
          )}

          {isSuperadmin && !host.query.isLoading && (host.query.isError || !host.query.data) && (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[280px] my-auto">
              <div className="panel-error-state max-w-sm w-full">
                <Database className="h-5 w-5" />
                <div>
                  <p className="font-semibold">
                    {t("settings.hostLoadFailed")}
                  </p>
                  <p className="mt-1 text-[12px] leading-6 opacity-90">
                    {t("settings.hostLoadFailedHint")}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<RefreshCw size={12} />}
                  onClick={() => void host.query.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </div>
            </div>
          )}

          {(!isSuperadmin || (!host.query.isLoading && host.query.data)) && (
            <>
              {shownTab === "general" && host.query.data && <GeneralTab host={host} systemSettings={host.query.data} />}

              {shownTab === "hosting" && isSuperadmin && <HostingTab />}

              {shownTab === "appearance" && <AppearanceTab />}

              {shownTab === "wallpaper" && <WallpaperTab />}

              {shownTab === "desktop" && <DesktopTab />}

              {shownTab === "screensaver" && <ScreensaverTab />}

              {shownTab === "sound" && <SoundTab />}

              {shownTab === "cloudflare" && <CloudflareTab cloudflare={cloudflare} />}

              {shownTab === "network" && isSuperadmin && host.query.data && <NetworkTab host={host} systemSettings={host.query.data} />}

              {shownTab === "security" && (isSuperadmin ? <SecurityTab host={host} setActiveTab={setActiveTab} /> : <AccountSecurityCard />)}

              {shownTab === "payment" && <PaymentTab payment={payment} listener={listener} setActiveTab={setActiveTab} canManageGateways={isSuperadmin} />}

              {shownTab === "audit" && isSuperadmin && <AuditTab host={host} />}

              {shownTab === "api_tokens" && <ApiTokensTab />}

              {shownTab === "reneo_database" && isSuperadmin && <ReneoDatabaseTab authenticated={authenticated} />}

              {shownTab === "reneo_runtime" && isSuperadmin && <ReneoRuntimeTab authenticated={authenticated} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
