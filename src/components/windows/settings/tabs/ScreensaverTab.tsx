import { Clock, Lock, LockKeyhole, Monitor, MonitorPlay, Orbit, Terminal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
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
    <div className="space-y-3">
      {/* ── Single Unified Lock Screen & Screensaver Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section 1: Master Enable Toggle ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Lock className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                {t("settings.screensaver.masterTitle")}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {lockScreenEnabled ? t("settings.screensaver.enableActive") : t("settings.screensaver.enableInactive")}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={lockScreenEnabled}
            onChange={() => setLockScreenEnabled(!lockScreenEnabled)}
            label={t("settings.screensaver.enableToggle")}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 2: Autentikasi & Keamanan ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.screensaver.authTitle")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.screensaver.authSubtitle")}</span>
          </div>

          <div className="space-y-2.5">
            {/* Require Password */}
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.screensaver.requirePassword")}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-tight">
                  {requirePasswordOnWake
                    ? t("settings.screensaver.requirePasswordActive")
                    : t("settings.screensaver.requirePasswordInactive")}
                </div>
              </div>
              <ToggleSwitch
                checked={requirePasswordOnWake}
                onChange={() => setRequirePasswordOnWake(!requirePasswordOnWake)}
                label={t("settings.screensaver.requirePassword")}
              />
            </div>

            {/* Wake on Mouse Move */}
            <div className="flex items-center justify-between gap-3 py-1 border-t border-[var(--win-border)]/50 pt-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.screensaver.wakeOnMouseMove")}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-tight">
                  {wakeOnMouseMove
                    ? t("settings.screensaver.wakeOnMouseMoveActive")
                    : t("settings.screensaver.wakeOnMouseMoveInactive")}
                </div>
              </div>
              <ToggleSwitch
                checked={wakeOnMouseMove}
                onChange={() => setWakeOnMouseMove(!wakeOnMouseMove)}
                label={t("settings.screensaver.wakeOnMouseMove")}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 3: Gaya Animasi Screensaver ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.screensaver.styleTitle")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.screensaver.styleSubtitle")}</span>
          </div>

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
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 4: Batas Waktu & Kunci Cepat ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.screensaver.timeoutTitle")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.screensaver.timeoutSubtitle")}</span>
          </div>

          <div className="space-y-2.5">
            {/* Idle Timeout Select */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.screensaver.idleTimeout")}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-tight">
                  {t("settings.screensaver.idleTimeoutDesc")}
                </div>
              </div>
              <div className="w-full shrink-0 sm:w-[180px]">
                <Select
                  value={String(autoLockTimeout)}
                  onChange={(value) => setAutoLockTimeout(parseInt(value, 10))}
                  buttonClassName="!h-8 text-[12px] px-2.5"
                  options={TIMEOUTS.map((item) => ({ value: item.value, label: t(item.key) }))}
                />
              </div>
            </div>

            {/* Lock Now Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 border-t border-[var(--win-border)]/50 pt-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.screensaver.lockNow")}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-tight">
                  {t("settings.screensaver.lockNowDesc")}
                </div>
              </div>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
