import { Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { AdwActionRow, SettingsGroup } from "../SettingsPrimitives";

const TIMEOUTS = [
  { value: "0", key: "settings.screensaver.timeoutNever" },
  { value: "5", key: "settings.screensaver.timeout5Min" },
  { value: "15", key: "settings.screensaver.timeout15Min" },
  { value: "30", key: "settings.screensaver.timeout30Min" },
  { value: "60", key: "settings.screensaver.timeout1Hour" },
];

export function ScreensaverTab() {
  const { t } = useI18n();
  const {
    lockScreenStyle,
    setLockScreenStyle,
    lockScreenEnabled,
    setLockScreenEnabled,
    requirePasswordOnWake,
    setRequirePasswordOnWake,
    wakeOnMouseMove,
    setWakeOnMouseMove,
    autoLockTimeout,
    setAutoLockTimeout,
    setIsLocked,
  } = useThemeStore();

  return (
    <div className="space-y-6">
      {/* ── 1. Lock Screen & Security (Flat GNOME Action Rows) ── */}
      <SettingsGroup
        title={t("settings.screensaver.authTitle")}
        description={t("settings.screensaver.authSubtitle")}
        cardClassName="!p-0"
      >
        <AdwActionRow
          title={t("settings.screensaver.masterTitle")}
          subtitle={
            lockScreenEnabled
              ? t("settings.screensaver.enableActive")
              : t("settings.screensaver.enableInactive")
          }
          control={
            <ToggleSwitch
              checked={lockScreenEnabled}
              onChange={() => setLockScreenEnabled(!lockScreenEnabled)}
              label={t("settings.screensaver.enableToggle")}
            />
          }
        />

        <AdwActionRow
          title={t("settings.screensaver.requirePassword")}
          subtitle={
            requirePasswordOnWake
              ? t("settings.screensaver.requirePasswordActive")
              : t("settings.screensaver.requirePasswordInactive")
          }
          control={
            <ToggleSwitch
              checked={requirePasswordOnWake}
              onChange={() => setRequirePasswordOnWake(!requirePasswordOnWake)}
              label={t("settings.screensaver.requirePassword")}
            />
          }
        />

        <AdwActionRow
          title={t("settings.screensaver.wakeOnMouseMove")}
          subtitle={
            wakeOnMouseMove
              ? t("settings.screensaver.wakeOnMouseMoveActive")
              : t("settings.screensaver.wakeOnMouseMoveInactive")
          }
          control={
            <ToggleSwitch
              checked={wakeOnMouseMove}
              onChange={() => setWakeOnMouseMove(!wakeOnMouseMove)}
              label={t("settings.screensaver.wakeOnMouseMove")}
            />
          }
        />

        <AdwActionRow
          title={t("settings.screensaver.idleTimeout")}
          subtitle={t("settings.screensaver.idleTimeoutDesc")}
          control={
            <div className="w-[180px]">
              <Select
                id="settings-screensaver-timeout"
                value={String(autoLockTimeout)}
                onChange={(value) => setAutoLockTimeout(parseInt(value, 10))}
                buttonClassName="!h-8 text-[12px] px-2.5"
                options={TIMEOUTS.map((item) => ({ value: item.value, label: t(item.key) }))}
              />
            </div>
          }
        />

        <AdwActionRow
          title={t("settings.screensaver.lockNow")}
          subtitle={t("settings.screensaver.lockNowDesc")}
          control={
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 !h-8 text-[12px]"
              icon={<Lock className="h-3.5 w-3.5" />}
              onClick={() => setIsLocked(true)}
            >
              {t("settings.screensaver.lockNowBtn")}
            </Button>
          }
        />
      </SettingsGroup>

      {/* ── 2. Screensaver Animation Style ── */}
      <SettingsGroup
        title={t("settings.screensaver.styleTitle")}
        description={t("settings.screensaver.styleSubtitle")}
        cardClassName="!p-0"
      >
        <AdwActionRow
          title={t("settings.screensaver.styleTitle")}
          subtitle={t("settings.screensaver.styleSubtitle")}
          control={
            <div className="w-[200px]">
              <Select
                id="settings-screensaver-style"
                value={lockScreenStyle}
                onChange={(val) => setLockScreenStyle(val as typeof lockScreenStyle)}
                buttonClassName="!h-8 text-[12px] px-2.5"
                options={[
                  { value: "clock", label: t("settings.screensaver.styleClock") },
                  { value: "matrix", label: t("settings.screensaver.styleMatrix") },
                  { value: "starfield", label: t("settings.screensaver.styleStarfield") },
                  { value: "none", label: t("settings.screensaver.styleNone") },
                ]}
              />
            </div>
          }
        />
      </SettingsGroup>
    </div>
  );
}
