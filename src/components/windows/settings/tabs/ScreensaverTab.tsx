import { Clock, Lock, LockKeyhole, Monitor, MonitorPlay, Orbit, Terminal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SettingRow } from "@/components/ui/SettingRow";
import { Select } from "@/components/ui/Select";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { OptionCards } from "../OptionCards";

const TIMEOUTS = [
  { value: "0", key: "settings.screensaver.timeoutNever" },
  { value: "5", key: "settings.screensaver.timeout5Min" },
  { value: "15", key: "settings.screensaver.timeout15Min" },
  { value: "30", key: "settings.screensaver.timeout30Min" },
  { value: "60", key: "settings.screensaver.timeout1Hour" },
];

// The lock screen: whether it exists, what it asks on waking, how it looks, and when it comes on
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
    <div className="space-y-3.5">
      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<Lock />} title={t("settings.screensaver.masterTitle")} subtitle={t("settings.screensaver.masterSubtitle")} />
        <SettingRow
          title={t("settings.screensaver.enableToggle")}
          description={lockScreenEnabled ? t("settings.screensaver.enableActive") : t("settings.screensaver.enableInactive")}
          control={<ToggleSwitch checked={lockScreenEnabled} onChange={() => setLockScreenEnabled(!lockScreenEnabled)} label={t("settings.screensaver.enableToggle")} />}
        />
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<LockKeyhole />} title={t("settings.screensaver.authTitle")} subtitle={t("settings.screensaver.authSubtitle")} />
        <SettingRow
          title={t("settings.screensaver.requirePassword")}
          description={requirePasswordOnWake ? t("settings.screensaver.requirePasswordActive") : t("settings.screensaver.requirePasswordInactive")}
          control={<ToggleSwitch checked={requirePasswordOnWake} onChange={() => setRequirePasswordOnWake(!requirePasswordOnWake)} label={t("settings.screensaver.requirePassword")} />}
        />
        <SettingRow
          title={t("settings.screensaver.wakeOnMouseMove")}
          description={wakeOnMouseMove ? t("settings.screensaver.wakeOnMouseMoveActive") : t("settings.screensaver.wakeOnMouseMoveInactive")}
          control={<ToggleSwitch checked={wakeOnMouseMove} onChange={() => setWakeOnMouseMove(!wakeOnMouseMove)} label={t("settings.screensaver.wakeOnMouseMove")} />}
        />
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<MonitorPlay />} title={t("settings.screensaver.styleTitle")} subtitle={t("settings.screensaver.styleSubtitle")} />
        <OptionCards
          label={t("settings.screensaver.styleTitle")}
          value={lockScreenStyle}
          onChange={setLockScreenStyle}
          options={[
            { key: "clock", label: t("settings.screensaver.styleClock"), description: t("settings.screensaver.styleClockDesc"), icon: <Clock /> },
            { key: "matrix", label: t("settings.screensaver.styleMatrix"), description: t("settings.screensaver.styleMatrixDesc"), icon: <Terminal /> },
            { key: "starfield", label: t("settings.screensaver.styleStarfield"), description: t("settings.screensaver.styleStarfieldDesc"), icon: <Orbit /> },
            { key: "none", label: t("settings.screensaver.styleNone"), description: t("settings.screensaver.styleNoneDesc"), icon: <Monitor /> },
          ]}
        />
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<Clock />} title={t("settings.screensaver.timeoutTitle")} subtitle={t("settings.screensaver.timeoutSubtitle")} />
        <SettingRow
          title={t("settings.screensaver.idleTimeout")}
          description={t("settings.screensaver.idleTimeoutDesc")}
          control={
            <div className="w-[180px]">
              <Select value={String(autoLockTimeout)} onChange={(value) => setAutoLockTimeout(parseInt(value, 10))} options={TIMEOUTS.map((item) => ({ value: item.value, label: t(item.key) }))} />
            </div>
          }
        />
        <SettingRow
          title={t("settings.screensaver.lockNow")}
          description={t("settings.screensaver.lockNowDesc")}
          control={
            <Button type="button" variant="primary" icon={<Lock className="h-3.5 w-3.5" />} onClick={() => setIsLocked(true)}>
              {t("settings.screensaver.lockNowBtn")}
            </Button>
          }
        />
      </section>
    </div>
  );
}
