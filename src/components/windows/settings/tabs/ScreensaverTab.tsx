import { Clock, Lock, LockKeyhole, Monitor, Orbit, Terminal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SettingRow } from "@/components/ui/SettingRow";
import { OptionCards } from "../OptionCards";
import { SettingsGroup } from "../SettingsPrimitives";

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
    <div className="space-y-4">
      {/* ── 1. Lock Screen & Security Group ── */}
      <SettingsGroup
        title={t("settings.screensaver.authTitle")}
        description={t("settings.screensaver.authSubtitle")}
      >
        <div className="flex flex-col">
          {/* Master Enable */}
          <SettingRow
            title={t("settings.screensaver.masterTitle")}
            description={lockScreenEnabled ? t("settings.screensaver.enableActive") : t("settings.screensaver.enableInactive")}
            icon={<Lock className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />}
            control={
              <ToggleSwitch
                checked={lockScreenEnabled}
                onChange={() => setLockScreenEnabled(!lockScreenEnabled)}
                label={t("settings.screensaver.enableToggle")}
              />
            }
          />

          {/* Require Password on Wake */}
          <SettingRow
            title={t("settings.screensaver.requirePassword")}
            description={
              requirePasswordOnWake
                ? t("settings.screensaver.requirePasswordActive")
                : t("settings.screensaver.requirePasswordInactive")
            }
            icon={<LockKeyhole className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />}
            control={
              <ToggleSwitch
                checked={requirePasswordOnWake}
                onChange={() => setRequirePasswordOnWake(!requirePasswordOnWake)}
                label={t("settings.screensaver.requirePassword")}
              />
            }
          />

          {/* Wake on Mouse Move */}
          <SettingRow
            title={t("settings.screensaver.wakeOnMouseMove")}
            description={
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
        </div>
      </SettingsGroup>

      {/* ── 2. Screensaver Animation Style Group ── */}
      <SettingsGroup
        title={t("settings.screensaver.styleTitle")}
        description={t("settings.screensaver.styleSubtitle")}
      >
        <OptionCards
          label={t("settings.screensaver.styleTitle")}
          value={lockScreenStyle}
          onChange={setLockScreenStyle}
          options={[
            {
              key: "clock",
              label: t("settings.screensaver.styleClock"),
              description: t("settings.screensaver.styleClockDesc"),
              icon: <Clock />,
            },
            {
              key: "matrix",
              label: t("settings.screensaver.styleMatrix"),
              description: t("settings.screensaver.styleMatrixDesc"),
              icon: <Terminal />,
            },
            {
              key: "starfield",
              label: t("settings.screensaver.styleStarfield"),
              description: t("settings.screensaver.styleStarfieldDesc"),
              icon: <Orbit />,
            },
            {
              key: "none",
              label: t("settings.screensaver.styleNone"),
              description: t("settings.screensaver.styleNoneDesc"),
              icon: <Monitor />,
            },
          ]}
        />
      </SettingsGroup>

      {/* ── 3. Idle Timeout & Quick Lock Group ── */}
      <SettingsGroup
        title={t("settings.screensaver.timeoutTitle")}
        description={t("settings.screensaver.timeoutSubtitle")}
      >
        <div className="flex flex-col">
          {/* Timeout Row */}
          <SettingRow
            title={t("settings.screensaver.idleTimeout")}
            description={t("settings.screensaver.idleTimeoutDesc")}
            icon={<Clock className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />}
            control={
              <div className="w-[180px]">
                <Select
                  value={String(autoLockTimeout)}
                  onChange={(value) => setAutoLockTimeout(parseInt(value, 10))}
                  buttonClassName="!h-8 text-[12px] px-2.5"
                  options={TIMEOUTS.map((item) => ({ value: item.value, label: t(item.key) }))}
                />
              </div>
            }
          />

          {/* Lock Now Action */}
          <SettingRow
            title={t("settings.screensaver.lockNow")}
            description={t("settings.screensaver.lockNowDesc")}
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
        </div>
      </SettingsGroup>
    </div>
  );
}
